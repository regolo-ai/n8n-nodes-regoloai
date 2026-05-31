import { OpenAIEmbeddings } from '@langchain/openai';
import { supplyModel } from '@n8n/ai-node-sdk';
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { getRegoloModelOptions, isString, RegoloReranker } from './GenericFunctions';

type RegoloCredentials = {
	apiKey: string;
	url: string;
};

type RegoloMode =
	| 'chat'
	| 'vision'
	| 'image'
	| 'speechToText'
	| 'embeddings'
	| 'rerank'
	| 'aiChatModel'
	| 'aiEmbeddings'
	| 'aiReranker';

type ModelOptions = {
	batchSize?: number;
	customBaseUrl?: string;
	frequencyPenalty?: number;
	maxRetries?: number;
	maxTokens?: number;
	n?: number;
	presencePenalty?: number;
	responseFormat?: 'text' | 'json_object';
	size?: string;
	stripNewLines?: boolean;
	temperature?: number;
	thinking?: boolean;
	timeout?: number;
	topN?: number;
	topP?: number;
};

function normalizeBaseUrl(url?: string): string {
	return (url || 'https://api.regolo.ai/v1').replace(/\/+$/, '');
}

function getModelsBaseUrl(url?: string): string {
	return normalizeBaseUrl(url).replace(/\/v1$/i, '');
}

function resolveBaseUrl(credentials: RegoloCredentials, useCustomEndpoint: boolean): string {
	if (!useCustomEndpoint) return normalizeBaseUrl(credentials.url);
	return `${getModelsBaseUrl(credentials.url)}/custom-model/v1`;
}

function resolveModel(selectedModel: string, customModel: string): string {
	return selectedModel === '__custom__' ? customModel : selectedModel;
}

function getMessageContent(text: string, imageUrl?: string) {
	if (!imageUrl) return text;

	return [
		{ type: 'text', text },
		{ type: 'image_url', image_url: { url: imageUrl } },
	];
}

export class RegoloAi implements INodeType {
	methods = {
		loadOptions: {
			getRegoloModelOptions,
		},
	};

	description: INodeTypeDescription = {
		displayName: 'Regolo AI',
		name: 'regoloAi',
		icon: 'file:regoloai.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["mode"]}}',
		description: 'Use Regolo AI models in n8n',
		defaults: { name: 'Regolo AI' },
		hidden: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: `={{ ((mode) => {
			const outputs = {
				aiChatModel: [{ type: "${NodeConnectionTypes.AiLanguageModel}", displayName: "Model" }],
				aiEmbeddings: [{ type: "${NodeConnectionTypes.AiEmbedding}", displayName: "Embeddings" }],
				aiReranker: [{ type: "${NodeConnectionTypes.AiReranker}", displayName: "Reranker" }],
			};
			return outputs[mode] || ["${NodeConnectionTypes.Main}"];
		})($parameter.mode) }}`,
		usableAsTool: true,
		credentials: [{ name: 'regoloApi', required: true }],
		requestDefaults: {
			ignoreHttpStatusErrors: true,
			baseURL: '={{$credentials.url}}',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Embeddings', 'Rerankers', 'Tools', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [{ url: 'https://docs.regolo.ai/' }],
			},
			alias: ['regolo', 'regolo ai', 'ocr', 'whisper', 'rerank', 'embeddings'],
		},
		properties: [
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'AI Chat Model', value: 'aiChatModel' },
					{ name: 'AI Embeddings', value: 'aiEmbeddings' },
					{ name: 'AI Reranker', value: 'aiReranker' },
					{ name: 'Chat', value: 'chat' },
					{ name: 'Embeddings', value: 'embeddings' },
					{ name: 'Image Generation', value: 'image' },
					{ name: 'Rerank', value: 'rerank' },
					{ name: 'Speech to Text', value: 'speechToText' },
					{ name: 'Vision / OCR', value: 'vision' },
				],
				default: 'chat',
			},
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				default: '__custom__',
				typeOptions: {
					loadOptionsMethod: 'getRegoloModelOptions',
				},
				options: [{ name: 'Custom (Type Manually)', value: '__custom__' }],
			},
			{
				displayName: 'Custom Model',
				name: 'customModel',
				type: 'string',
				default: '',
				required: true,
				description: 'Type a Regolo model ID',
				displayOptions: {
					show: {
						model: ['__custom__'],
					},
				},
			},
			{
				displayName: 'Use Custom Model Endpoint',
				name: 'useCustomEndpoint',
				type: 'boolean',
				default: false,
				description: 'Whether to call the Regolo custom-model endpoint instead of the standard endpoint',
			},
			{
				displayName: 'Messages',
				name: 'messages',
				type: 'fixedCollection',
				typeOptions: { sortable: true, multipleValues: true },
				displayOptions: { show: { mode: ['chat'] } },
				placeholder: 'Add Message',
				default: {},
				options: [
					{
						displayName: 'Message',
						name: 'message',
						values: [
							{
								displayName: 'Role',
								name: 'role',
								type: 'options',
								options: [
									{ name: 'System', value: 'system' },
									{ name: 'User', value: 'user' },
									{ name: 'Assistant', value: 'assistant' },
								],
								default: 'user',
							},
							{ displayName: 'Content', name: 'content', type: 'string', default: '' },
						],
					},
				],
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				default: '',
				displayOptions: { show: { mode: ['vision', 'image'] } },
				typeOptions: { rows: 3 },
			},
			{
				displayName: 'Image URL or Base64',
				name: 'imageUrl',
				type: 'string',
				default: '',
				description: 'Image URL, data URL, or base64 payload to send to the vision/OCR model',
				displayOptions: { show: { mode: ['vision'] } },
			},
			{
				displayName: 'Input',
				name: 'input',
				type: 'string',
				default: '',
				displayOptions: { show: { mode: ['embeddings'] } },
				typeOptions: { rows: 3 },
			},
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				displayOptions: { show: { mode: ['rerank'] } },
			},
			{
				displayName: 'Documents',
				name: 'documents',
				type: 'fixedCollection',
				typeOptions: { sortable: true, multipleValues: true },
				displayOptions: { show: { mode: ['rerank'] } },
				placeholder: 'Add Document',
				default: {},
				options: [
					{
						displayName: 'Document',
						name: 'document',
						values: [{ displayName: 'Text', name: 'text', type: 'string', default: '' }],
					},
				],
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				displayOptions: { show: { mode: ['speechToText'] } },
				description: 'Name of the binary property that contains the audio file',
			},
			{
				displayName: 'Response Format',
				name: 'imageResponseFormat',
				type: 'options',
				default: 'binaryData',
				displayOptions: { show: { mode: ['image'] } },
				options: [
					{ name: 'Binary File', value: 'binaryData' },
					{ name: 'Image URL', value: 'imageUrl' },
				],
			},
			{
				displayName:
					'When using JSON response format, include the word "json" in the connected chain or agent prompt.',
				name: 'jsonNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						'/options.responseFormat': ['json_object'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Batch Size',
						name: 'batchSize',
						type: 'number',
						default: 512,
						typeOptions: { minValue: 1, maxValue: 2048 },
					},
					{
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						type: 'number',
						default: 0,
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 1 },
					},
					{
						displayName: 'Max Retries',
						name: 'maxRetries',
						type: 'number',
						default: 2,
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						type: 'number',
						default: -1,
					},
					{
						displayName: 'Number of Images',
						name: 'n',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 1, maxValue: 10 },
					},
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						type: 'number',
						default: 0,
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 1 },
					},
					{
						displayName: 'Resolution',
						name: 'size',
						type: 'options',
						default: '1024x1024',
						options: [
							{ name: '256x256', value: '256x256' },
							{ name: '512x512', value: '512x512' },
							{ name: '1024x1024', value: '1024x1024' },
						],
					},
					{
						displayName: 'Response Format',
						name: 'responseFormat',
						type: 'options',
						default: 'text',
						options: [
							{ name: 'Text', value: 'text' },
							{ name: 'JSON', value: 'json_object' },
						],
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						type: 'number',
						default: 0.7,
						typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
					},
					{
						displayName: 'Strip New Lines',
						name: 'stripNewLines',
						type: 'boolean',
						default: true,
					},
					{
						displayName: 'Thinking',
						name: 'thinking',
						type: 'boolean',
						default: false,
					},
					{
						displayName: 'Timeout',
						name: 'timeout',
						type: 'number',
						default: 360000,
					},
					{
						displayName: 'Top N',
						name: 'topN',
						type: 'number',
						default: 3,
					},
					{
						displayName: 'Top P',
						name: 'topP',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 1 },
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials<RegoloCredentials>('regoloApi');

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const mode = this.getNodeParameter('mode', itemIndex) as RegoloMode;
			if (mode.startsWith('ai')) {
				throw new NodeOperationError(this.getNode(), 'AI modes must be connected as AI sub-nodes', {
					itemIndex,
				});
			}

			const model = resolveModel(
				this.getNodeParameter('model', itemIndex) as string,
				this.getNodeParameter('customModel', itemIndex, '') as string,
			);
			const useCustomEndpoint = this.getNodeParameter('useCustomEndpoint', itemIndex, false) as boolean;
			const baseUrl = resolveBaseUrl(credentials, useCustomEndpoint);
			const options = this.getNodeParameter('options', itemIndex, {}) as ModelOptions;

			if (!model) {
				throw new NodeOperationError(this.getNode(), 'Model is required', { itemIndex });
			}

			if (mode === 'chat' || mode === 'vision') {
				const messagesParameter = this.getNodeParameter('messages', itemIndex, {}) as {
					message?: Array<{ role: string; content: string }>;
				};
				const prompt = this.getNodeParameter('prompt', itemIndex, '') as string;
				const imageUrl = this.getNodeParameter('imageUrl', itemIndex, '') as string;
				const messages =
					mode === 'vision'
						? [{ role: 'user', content: getMessageContent(prompt, imageUrl) }]
						: (messagesParameter.message ?? []).map((message) => ({
								role: message.role,
								content: message.content,
							}));
				const body: Record<string, unknown> = {
					model,
					messages,
					frequency_penalty: options.frequencyPenalty,
					max_tokens: options.maxTokens && options.maxTokens > -1 ? options.maxTokens : undefined,
					presence_penalty: options.presencePenalty,
					temperature: options.temperature,
					top_p: options.topP,
				};
				if (options.responseFormat === 'json_object') body.response_format = { type: 'json_object' };
				if (options.thinking) body.thinking = true;

				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'regoloApi', {
					method: 'POST',
					url: `${baseUrl}/chat/completions`,
					body,
					json: true,
				});

				returnData.push({ json: response });
			}

			if (mode === 'image') {
				const prompt = this.getNodeParameter('prompt', itemIndex) as string;
				const imageResponseFormat = this.getNodeParameter(
					'imageResponseFormat',
					itemIndex,
					'binaryData',
				) as string;
				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'regoloApi', {
					method: 'POST',
					url: `${baseUrl}/images/generations`,
					body: {
						model,
						prompt,
						n: options.n,
						size: options.size,
						response_format: imageResponseFormat === 'imageUrl' ? 'url' : 'b64_json',
					},
					json: true,
				});

				if (imageResponseFormat === 'imageUrl') {
					returnData.push({ json: response });
				} else {
					for (const image of response.data ?? []) {
						if (!isString(image.b64_json)) {
							throw new NodeOperationError(this.getNode(), 'Expected b64_json in image response', {
								itemIndex,
							});
						}
						returnData.push({
							json: {},
							binary: {
								data: await this.helpers.prepareBinaryData(
									Buffer.from(image.b64_json, 'base64'),
									'image.png',
									'image/png',
								),
							},
						});
					}
				}
			}

			if (mode === 'speechToText') {
				const binaryPropertyName = this.getNodeParameter(
					'binaryPropertyName',
					itemIndex,
					'data',
				) as string;
				const binaryData = items[itemIndex].binary?.[binaryPropertyName];
				if (!binaryData) {
					throw new NodeOperationError(
						this.getNode(),
						`No binary data property "${binaryPropertyName}" found`,
						{ itemIndex },
					);
				}

				const audio = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'regoloApi', {
					method: 'POST',
					url: `${baseUrl}/audio/transcriptions`,
					formData: {
						model,
						file: {
							value: audio,
							options: {
								filename: binaryData.fileName ?? 'audio.wav',
								contentType: binaryData.mimeType,
							},
						},
					},
					json: true,
				} as any);

				returnData.push({ json: response });
			}

			if (mode === 'embeddings') {
				const input = this.getNodeParameter('input', itemIndex) as string;
				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'regoloApi', {
					method: 'POST',
					url: `${baseUrl}/embeddings`,
					body: { model, input },
					json: true,
				});

				returnData.push({ json: response });
			}

			if (mode === 'rerank') {
				const query = this.getNodeParameter('query', itemIndex) as string;
				const documentsParameter = this.getNodeParameter('documents', itemIndex, {}) as {
					document?: Array<{ text: string }>;
				};
				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'regoloApi', {
					method: 'POST',
					url: `${getModelsBaseUrl(baseUrl)}/rerank`,
					body: {
						model,
						query,
						documents: (documentsParameter.document ?? []).map((document) => document.text),
						top_n: options.topN,
					},
					json: true,
				});

				returnData.push({ json: response });
			}
		}

		return [returnData];
	}

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const mode = this.getNodeParameter('mode', itemIndex) as RegoloMode;
		const credentials = await this.getCredentials<RegoloCredentials>('regoloApi');
		const model = resolveModel(
			this.getNodeParameter('model', itemIndex) as string,
			this.getNodeParameter('customModel', itemIndex, '') as string,
		);
		const useCustomEndpoint = this.getNodeParameter('useCustomEndpoint', itemIndex, false) as boolean;
		const baseUrl = resolveBaseUrl(credentials, useCustomEndpoint);
		const options = this.getNodeParameter('options', itemIndex, {}) as ModelOptions;

		if (mode === 'aiChatModel') {
			const additionalParams: Record<string, unknown> = {};
			if (options.responseFormat === 'json_object') {
				additionalParams.response_format = { type: 'json_object' };
			}
			if (options.thinking) additionalParams.thinking = true;

			return supplyModel(this, {
				type: 'openai',
				baseUrl,
				apiKey: credentials.apiKey,
				model,
				frequencyPenalty: options.frequencyPenalty,
				maxRetries: options.maxRetries,
				maxTokens: options.maxTokens,
				presencePenalty: options.presencePenalty,
				temperature: options.temperature,
				timeout: options.timeout,
				topP: options.topP,
				supportsStrictToolCalling: false,
				additionalParams: Object.keys(additionalParams).length ? additionalParams : undefined,
			});
		}

		if (mode === 'aiEmbeddings') {
			return {
				response: new OpenAIEmbeddings({
					apiKey: credentials.apiKey,
					model,
					batchSize: options.batchSize,
					stripNewLines: options.stripNewLines,
					timeout: options.timeout,
					configuration: { baseURL: baseUrl },
				}),
			};
		}

		if (mode === 'aiReranker') {
			return {
				response: new RegoloReranker({
					apiKey: credentials.apiKey,
					baseUrl,
					model,
					topN: options.topN ?? 3,
				}),
			};
		}

		throw new NodeOperationError(this.getNode(), 'This mode does not supply AI data', { itemIndex });
	}
}

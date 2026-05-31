import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	getRegoloOcrModelOptions,
	modelProperties,
	RegoloCommonOptions,
	resolveBaseUrl,
	resolveModel,
} from './GenericFunctions';

type RegoloCredentials = {
	apiKey: string;
	url: string;
};

function buildImageContent(prompt: string, imageUrl: string) {
	return [
		{ type: 'text', text: prompt },
		{ type: 'image_url', image_url: { url: imageUrl } },
	];
}

export class RegoloAiOcr implements INodeType {
	methods = {
		loadOptions: {
			getRegoloModelOptions: getRegoloOcrModelOptions,
		},
	};

	description: INodeTypeDescription = {
		displayName: 'Regolo AI OCR',
		name: 'regoloAiOcr',
		icon: 'file:regoloai.svg',
		group: ['transform'],
		version: 1,
		description: 'Extract text from images with Regolo AI OCR models',
		defaults: { name: 'Regolo AI OCR' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'regoloApi', required: true }],
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Tools', 'Root Nodes'] },
			resources: { primaryDocumentation: [{ url: 'https://docs.regolo.ai/' }] },
			alias: ['regolo', 'ocr', 'vision'],
		},
		properties: [
			...modelProperties,
			{
				displayName: 'Image Source',
				name: 'imageSource',
				type: 'options',
				default: 'url',
				options: [
					{ name: 'Image URL or Base64', value: 'url' },
					{ name: 'Binary File', value: 'binary' },
				],
			},
			{
				displayName: 'Image URL or Base64',
				name: 'imageUrl',
				type: 'string',
				default: '',
				required: true,
				description: 'Image URL, data URL, or base64 payload to send to the OCR model',
				displayOptions: { show: { imageSource: ['url'] } },
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property that contains the image file',
				displayOptions: { show: { imageSource: ['binary'] } },
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				default: 'Extract all text from this image.',
				required: true,
				typeOptions: { rows: 3 },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{ displayName: 'Maximum Number of Tokens', name: 'maxTokens', type: 'number', default: -1 },
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						type: 'number',
						default: 0,
						typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
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
			const model = resolveModel(
				this.getNodeParameter('model', itemIndex) as string,
				this.getNodeParameter('customModel', itemIndex, '') as string,
			);
			if (!model) throw new NodeOperationError(this.getNode(), 'Model is required', { itemIndex });

			const imageSource = this.getNodeParameter('imageSource', itemIndex, 'url') as string;
			let imageUrl = this.getNodeParameter('imageUrl', itemIndex, '') as string;
			if (imageSource === 'binary') {
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
				const image = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
				imageUrl = `data:${binaryData.mimeType ?? 'image/png'};base64,${image.toString('base64')}`;
			}

			const useCustomEndpoint = this.getNodeParameter('useCustomEndpoint', itemIndex, false) as boolean;
			const prompt = this.getNodeParameter('prompt', itemIndex) as string;
			const options = this.getNodeParameter('options', itemIndex, {}) as RegoloCommonOptions;
			const response = await this.helpers.httpRequestWithAuthentication.call(this, 'regoloApi', {
				method: 'POST',
				url: `${resolveBaseUrl(credentials, useCustomEndpoint)}/chat/completions`,
				body: {
					model,
					messages: [{ role: 'user', content: buildImageContent(prompt, imageUrl) }],
					max_tokens: options.maxTokens && options.maxTokens > -1 ? options.maxTokens : undefined,
					temperature: options.temperature,
				},
				json: true,
			});

			returnData.push({ json: response });
		}

		return [returnData];
	}
}

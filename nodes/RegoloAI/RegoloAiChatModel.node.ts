import { supplyModel } from '@n8n/ai-node-sdk';
import type { INodeType, INodeTypeDescription, ISupplyDataFunctions, SupplyData } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	getRegoloChatModelOptions,
	modelProperties,
	RegoloCommonOptions,
	resolveBaseUrl,
	resolveModel,
} from './GenericFunctions';

type RegoloCredentials = {
	apiKey: string;
	url: string;
};

export class RegoloAiChatModel implements INodeType {
	methods = {
		loadOptions: {
			getRegoloModelOptions: getRegoloChatModelOptions,
		},
	};

	description: INodeTypeDescription = {
		displayName: 'Regolo AI Chat Model',
		name: 'regoloAiChatModel',
		icon: 'file:regoloai.svg',
		group: ['transform'],
		version: 1,
		description: 'Use Regolo AI chat models in n8n AI workflows',
		defaults: { name: 'Regolo AI Chat Model' },
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		credentials: [{ name: 'regoloApi', required: true }],
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Language Models'], 'Language Models': ['Chat Models (Recommended)'] },
			resources: { primaryDocumentation: [{ url: 'https://docs.regolo.ai/' }] },
			alias: ['regolo', 'regolo ai', 'chat model', 'llm'],
		},
		properties: [
			...modelProperties,
			{
				displayName:
					'When using JSON response format, include the word "json" in the connected chain or agent prompt.',
				name: 'jsonNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { '/options.responseFormat': ['json_object'] } },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						type: 'number',
						default: 0,
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 1 },
					},
					{ displayName: 'Max Retries', name: 'maxRetries', type: 'number', default: 2 },
					{ displayName: 'Maximum Number of Tokens', name: 'maxTokens', type: 'number', default: -1 },
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						type: 'number',
						default: 0,
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 1 },
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
					{ displayName: 'Thinking', name: 'thinking', type: 'boolean', default: false },
					{ displayName: 'Timeout', name: 'timeout', type: 'number', default: 360000 },
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

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials<RegoloCredentials>('regoloApi');
		const model = resolveModel(
			this.getNodeParameter('model', itemIndex) as string,
			this.getNodeParameter('customModel', itemIndex, '') as string,
		);
		if (!model) throw new NodeOperationError(this.getNode(), 'Model is required', { itemIndex });

		const useCustomEndpoint = this.getNodeParameter('useCustomEndpoint', itemIndex, false) as boolean;
		const options = this.getNodeParameter('options', itemIndex, {}) as RegoloCommonOptions;
		const additionalParams: Record<string, unknown> = {};
		if (options.responseFormat === 'json_object') additionalParams.response_format = { type: 'json_object' };
		if (options.thinking) additionalParams.thinking = true;

		return supplyModel(this, {
			type: 'openai',
			baseUrl: resolveBaseUrl(credentials, useCustomEndpoint),
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
}

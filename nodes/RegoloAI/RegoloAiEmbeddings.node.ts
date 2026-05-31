import { OpenAIEmbeddings } from '@langchain/openai';
import type { INodeType, INodeTypeDescription, ISupplyDataFunctions, SupplyData } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	getRegoloEmbeddingModelOptions,
	modelProperties,
	RegoloCommonOptions,
	resolveBaseUrl,
	resolveModel,
} from './GenericFunctions';

type RegoloCredentials = {
	apiKey: string;
	url: string;
};

export class RegoloAiEmbeddings implements INodeType {
	methods = {
		loadOptions: {
			getRegoloModelOptions: getRegoloEmbeddingModelOptions,
		},
	};

	description: INodeTypeDescription = {
		displayName: 'Regolo AI Embeddings',
		name: 'regoloAiEmbeddings',
		icon: 'file:regoloai.svg',
		group: ['transform'],
		version: 1,
		description: 'Use Regolo AI embedding models in vector workflows',
		defaults: { name: 'Regolo AI Embeddings' },
		inputs: [],
		outputs: [NodeConnectionTypes.AiEmbedding],
		credentials: [{ name: 'regoloApi', required: true }],
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Embeddings'] },
			resources: { primaryDocumentation: [{ url: 'https://docs.regolo.ai/' }] },
			alias: ['regolo', 'embedding', 'embeddings'],
		},
		properties: [
			...modelProperties,
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
					{ displayName: 'Strip New Lines', name: 'stripNewLines', type: 'boolean', default: true },
					{ displayName: 'Timeout', name: 'timeout', type: 'number', default: 360000 },
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

		return {
			response: new OpenAIEmbeddings({
				apiKey: credentials.apiKey,
				model,
				batchSize: options.batchSize,
				stripNewLines: options.stripNewLines,
				timeout: options.timeout,
				configuration: { baseURL: resolveBaseUrl(credentials, useCustomEndpoint) },
			}),
		};
	}
}

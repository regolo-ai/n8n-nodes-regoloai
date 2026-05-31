import type { INodeType, INodeTypeDescription, ISupplyDataFunctions, SupplyData } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	getRegoloRerankerModelOptions,
	modelProperties,
	RegoloCommonOptions,
	RegoloReranker,
	resolveBaseUrl,
	resolveModel,
} from './GenericFunctions';

type RegoloCredentials = {
	apiKey: string;
	url: string;
};

export class RegoloAiReranker implements INodeType {
	methods = {
		loadOptions: {
			getRegoloModelOptions: getRegoloRerankerModelOptions,
		},
	};

	description: INodeTypeDescription = {
		displayName: 'Regolo AI Reranker',
		name: 'regoloAiReranker',
		icon: 'file:regoloai.svg',
		group: ['transform'],
		version: 1,
		description: 'Use Regolo AI reranking models in retrieval workflows',
		defaults: { name: 'Regolo AI Reranker' },
		inputs: [],
		outputs: [NodeConnectionTypes.AiReranker],
		credentials: [{ name: 'regoloApi', required: true }],
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Rerankers'] },
			resources: { primaryDocumentation: [{ url: 'https://docs.regolo.ai/' }] },
			alias: ['regolo', 'rerank', 'reranker'],
		},
		properties: [
			...modelProperties,
			{
				displayName: 'Top N',
				name: 'topN',
				type: 'number',
				default: 3,
				typeOptions: { minValue: 1 },
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
		const topN = this.getNodeParameter('topN', itemIndex, 3) as RegoloCommonOptions['topN'];

		return {
			response: new RegoloReranker({
				apiKey: credentials.apiKey,
				baseUrl: resolveBaseUrl(credentials, useCustomEndpoint),
				model,
				topN: topN ?? 3,
			}),
		};
	}
}

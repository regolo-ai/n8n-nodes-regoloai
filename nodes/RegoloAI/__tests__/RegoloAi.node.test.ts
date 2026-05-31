import { supplyModel } from '@n8n/ai-node-sdk';
import { OpenAIEmbeddings } from '@langchain/openai';
import { NodeConnectionTypes } from 'n8n-workflow';

import { RegoloAi } from '../RegoloAi.node';
import { RegoloAiChatModel } from '../RegoloAiChatModel.node';
import { RegoloAiEmbeddings } from '../RegoloAiEmbeddings.node';
import { RegoloAiImage } from '../RegoloAiImage.node';
import { RegoloAiOcr } from '../RegoloAiOcr.node';
import { RegoloAiReranker } from '../RegoloAiReranker.node';
import { RegoloAiSpeechToText } from '../RegoloAiSpeechToText.node';
import { RegoloReranker } from '../GenericFunctions';

jest.mock(
	'@n8n/ai-node-sdk',
	() => ({
		supplyModel: jest.fn((ctx, model) => ({ response: { ctx, model } })),
	}),
	{ virtual: true },
);

jest.mock('@langchain/openai', () => ({
	OpenAIEmbeddings: jest.fn(function OpenAIEmbeddingsMock(this: any, fields: unknown) {
		this.fields = fields;
	}),
}));

jest.mock('n8n-workflow', () => {
	class MockNodeOperationError extends Error {}
	return {
		NodeConnectionTypes: {
			Main: 'main',
			AiEmbedding: 'ai_embedding',
			AiLanguageModel: 'ai_languageModel',
			AiReranker: 'ai_reranker',
		},
		NodeApiError: class MockNodeApiError extends Error {},
		NodeOperationError: MockNodeOperationError,
	};
});

function createSupplyContext(parameters: Record<string, unknown>) {
	return {
		getCredentials: jest.fn(async () => ({
			apiKey: 'test-api-key',
			url: 'https://api.regolo.ai/v1',
		})),
		getNodeParameter: jest.fn((name: string, _itemIndex: number, defaultValue?: unknown) => {
			if (Object.prototype.hasOwnProperty.call(parameters, name)) return parameters[name];
			return defaultValue;
		}),
		getNode: jest.fn(() => ({ name: 'Regolo AI' })),
	};
}

describe('Regolo AI nodes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('keeps the legacy combined Regolo AI node hidden for old workflows', () => {
		const node = new RegoloAi();

		expect(node.description.displayName).toBe('Regolo AI');
		expect(node.description.hidden).toBe(true);
		expect(String(node.description.outputs)).toContain(NodeConnectionTypes.AiLanguageModel);
	});

	it('exposes separate visible nodes for every Regolo capability', () => {
		expect(new RegoloAiChatModel().description.outputs).toEqual([NodeConnectionTypes.AiLanguageModel]);
		expect(new RegoloAiEmbeddings().description.outputs).toEqual([NodeConnectionTypes.AiEmbedding]);
		expect(new RegoloAiReranker().description.outputs).toEqual([NodeConnectionTypes.AiReranker]);
		expect(new RegoloAiImage().description.outputs).toEqual([NodeConnectionTypes.Main]);
		expect(new RegoloAiOcr().description.outputs).toEqual([NodeConnectionTypes.Main]);
		expect(new RegoloAiSpeechToText().description.outputs).toEqual([NodeConnectionTypes.Main]);
	});

	it('supplies a Regolo chat model for AI Agent connections', async () => {
		const node = new RegoloAiChatModel();
		const ctx = createSupplyContext({
			model: 'Llama-3.3-70B-Instruct',
			useCustomEndpoint: false,
			options: { responseFormat: 'json_object', thinking: true, temperature: 0.2 },
		});

		await node.supplyData.call(ctx as any, 0);

		expect(supplyModel).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({
				type: 'openai',
				baseUrl: 'https://api.regolo.ai/v1',
				apiKey: 'test-api-key',
				model: 'Llama-3.3-70B-Instruct',
				temperature: 0.2,
				additionalParams: {
					response_format: { type: 'json_object' },
					thinking: true,
				},
			}),
		);
	});

	it('supplies OpenAI-compatible embeddings', async () => {
		const node = new RegoloAiEmbeddings();
		const ctx = createSupplyContext({
			model: 'gte-Qwen2',
			useCustomEndpoint: false,
			options: { batchSize: 64, stripNewLines: true },
		});

		const result = await node.supplyData.call(ctx as any, 0);

		expect(OpenAIEmbeddings).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: 'test-api-key',
				model: 'gte-Qwen2',
				batchSize: 64,
				configuration: { baseURL: 'https://api.regolo.ai/v1' },
			}),
		);
		expect(result.response).toBeInstanceOf(OpenAIEmbeddings as any);
	});

	it('supplies a Regolo reranker', async () => {
		const node = new RegoloAiReranker();
		const ctx = createSupplyContext({
			model: 'Qwen3-Reranker-4B',
			useCustomEndpoint: false,
			topN: 5,
		});

		const result = await node.supplyData.call(ctx as any, 0);

		expect(result.response).toBeInstanceOf(RegoloReranker);
	});
});

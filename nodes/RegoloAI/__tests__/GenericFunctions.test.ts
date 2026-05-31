import {
	dedupeOptionsPostReceive,
	filterModelOptions,
	getRegoloModelOptions,
	isString,
	sendErrorPostReceive,
	uniqueModelOptions,
} from '../GenericFunctions';
import { NodeApiError } from 'n8n-workflow';

jest.mock('n8n-workflow', () => {
	class MockNodeApiError extends Error {
		public node: unknown;
		public received: unknown;
		constructor(node: unknown, received: unknown) {
			super('NodeApiError');
			this.name = 'NodeApiError';
			this.node = node;
			this.received = received;
		}
	}
	return {
		NodeApiError: MockNodeApiError,
	};
});

type AnyResponse = {
	statusCode?: number | string | null;
	[key: string]: any;
};

// Helper to create a minimal n8n execution context with getNode().
function createCtx() {
	return {
		getNode: jest.fn(() => ({ name: 'RegoloAI' })),
	} as unknown as ThisParameterType<typeof sendErrorPostReceive>; // IExecuteSingleFunctions-ish
}

describe('GenericFunctions', () => {
	describe('sendErrorPostReceive', () => {
		it('returns data as-is when status code is 200', async () => {
			const ctx = createCtx();
			const data = [{ json: { ok: true } }];
			const response: AnyResponse = { statusCode: 200, body: 'OK' };

			const result = await sendErrorPostReceive.call(ctx, data, response as any);

			// Should be identity-like behavior on success
			expect(result).toBe(data);
			expect(result).toEqual(data);
		});

		it('returns data as-is when statusCode is undefined (treated as empty string)', async () => {
			const ctx = createCtx();
			const data = [{ json: { ok: true } }];
			const response: AnyResponse = { statusCode: undefined };

			const result = await sendErrorPostReceive.call(ctx, data, response as any);
			expect(result).toBe(data);
		});

		it('throws NodeApiError for 4xx with object-like response (JsonObject path)', async () => {
			const ctx = createCtx();
			const data = [{ json: { ok: false } }];
			const response: AnyResponse = { statusCode: 404, body: 'Not Found', extra: { a: 1 } };

			await expect(sendErrorPostReceive.call(ctx, data, response as any)).rejects.toBeInstanceOf(
				NodeApiError,
			);

			try {
				await sendErrorPostReceive.call(ctx, data, response as any);
			} catch (err: any) {
				// Our mock exposes the received payload as `received`
				expect(err).toBeInstanceOf(NodeApiError);
				expect(err.received).toEqual(response);
				expect(err.node).toEqual({ name: 'RegoloAI' });
			}
		});

		it('throws NodeApiError for 5xx with non-object response (fallback path)', async () => {
			const ctx = createCtx();
			const data = [{ json: { ok: false } }];

			const response: any[] = [];
			response.push('payload');
			(response as any).statusCode = 500;
			(response as any).body = 'Internal Server Error';

			await expect(sendErrorPostReceive.call(ctx, data, response as any)).rejects.toBeInstanceOf(
				NodeApiError,
			);

			try {
				await sendErrorPostReceive.call(ctx, data, response as any);
			} catch (err: any) {
				expect(err).toBeInstanceOf(NodeApiError);
				// The function constructs:
				// { message: 'Request failed', ...response }
				// Spreading a string produces an object with char indices as keys;
				// we verify at least the message is present.
				expect(err.received).toEqual(
					expect.objectContaining({
						message: 'Request failed',
					}),
				);
			}
		});

		it('treats string statusCode that starts with "4" as an error', async () => {
			const ctx = createCtx();
			const data = [{ json: { ok: false } }];
			const response: AnyResponse = { statusCode: '401', reason: 'Unauthorized' };

			await expect(sendErrorPostReceive.call(ctx, data, response as any)).rejects.toBeInstanceOf(
				NodeApiError,
			);

			try {
				await sendErrorPostReceive.call(ctx, data, response as any);
			} catch (err: any) {
				expect(err.received).toEqual(response);
			}
		});
	});

	describe('isString', () => {
		it('returns true for strings', () => {
			expect(isString('hello')).toBe(true);
			expect(isString('')).toBe(true);
			expect(isString(String('x'))).toBe(true);
		});

		it('returns false for non-strings', () => {
			expect(isString(123)).toBe(false);
			expect(isString({})).toBe(false);
			expect(isString([])).toBe(false);
			expect(isString(null)).toBe(false);
			expect(isString(undefined)).toBe(false);
		});
	});

	describe('dedupeOptionsPostReceive', () => {
		it('removes duplicate options by value and keeps the first occurrence', async () => {
			const data = [
				{ json: { name: 'mistral-small3.2', value: 'mistral-small3.2' } },
				{ json: { name: 'Mistral Small 3.2', value: 'mistral-small3.2' } },
				{ json: { name: 'qwen3.5-9b', value: 'qwen3.5-9b' } },
			];

			const result = await dedupeOptionsPostReceive.call(createCtx(), data as any);

			expect(result).toEqual([
				{ json: { name: 'mistral-small3.2', value: 'mistral-small3.2' } },
				{ json: { name: 'qwen3.5-9b', value: 'qwen3.5-9b' } },
			]);
		});
	});

	describe('uniqueModelOptions', () => {
		it('accepts Regolo, OpenAI-style, named, and string model records', () => {
			expect(
				uniqueModelOptions([
					{ model_name: 'Llama-3.3-70B-Instruct' },
					{ id: 'gte-Qwen2' },
					{ name: 'Qwen-Image' },
					'faster-whisper-large-v3',
					{ id: 'llama-3.3-70b-instruct' },
				]),
			).toEqual([
				{ name: 'faster-whisper-large-v3', value: 'faster-whisper-large-v3' },
				{ name: 'gte-Qwen2', value: 'gte-Qwen2' },
				{ name: 'Llama-3.3-70B-Instruct', value: 'Llama-3.3-70B-Instruct' },
				{ name: 'Qwen-Image', value: 'Qwen-Image' },
			]);
		});
	});

	describe('filterModelOptions', () => {
		const options = uniqueModelOptions([
			'Llama-3.3-70B-Instruct',
			'gte-Qwen2',
			'Qwen3-Reranker-4B',
			'Qwen-Image',
			'deepseek-ocr',
			'faster-whisper-large-v3',
		]);

		it('keeps chat models out of specialist model lists', () => {
			expect(filterModelOptions(options, 'chat')).toEqual([
				{ name: 'Llama-3.3-70B-Instruct', value: 'Llama-3.3-70B-Instruct' },
			]);
		});

		it('filters specialist families by model name hints', () => {
			expect(filterModelOptions(options, 'embeddings')).toEqual([
				{ name: 'gte-Qwen2', value: 'gte-Qwen2' },
			]);
			expect(filterModelOptions(options, 'rerank')).toEqual([
				{ name: 'Qwen3-Reranker-4B', value: 'Qwen3-Reranker-4B' },
			]);
			expect(filterModelOptions(options, 'image')).toEqual([
				{ name: 'Qwen-Image', value: 'Qwen-Image' },
			]);
			expect(filterModelOptions(options, 'ocr')).toEqual([
				{ name: 'deepseek-ocr', value: 'deepseek-ocr' },
			]);
			expect(filterModelOptions(options, 'speechToText')).toEqual([
				{ name: 'faster-whisper-large-v3', value: 'faster-whisper-large-v3' },
			]);
		});
	});

	describe('getRegoloModelOptions', () => {
		it('tries catalog endpoints and returns deduplicated options', async () => {
			const httpRequestWithAuthentication = jest
				.fn()
				.mockRejectedValueOnce(new Error('not found'))
				.mockResolvedValueOnce({
					data: [{ id: 'deepseek-ocr' }, { model_name: 'deepseek-ocr' }, 'Qwen3-Reranker-4B'],
				});
			const ctx = {
				getCredentials: jest.fn(async () => ({
					apiKey: 'test-api-key',
					url: 'https://api.regolo.ai/v1',
				})),
				helpers: {
					httpRequestWithAuthentication,
				},
			};

			const result = await getRegoloModelOptions.call(ctx as any);

			expect(result).toEqual([
				{ name: 'deepseek-ocr', value: 'deepseek-ocr' },
				{ name: 'Qwen3-Reranker-4B', value: 'Qwen3-Reranker-4B' },
			]);
			expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
		});

		it('returns an empty list instead of throwing when all catalog endpoints fail', async () => {
			const ctx = {
				getCredentials: jest.fn(async () => ({
					apiKey: 'test-api-key',
					url: 'https://api.regolo.ai/v1',
				})),
				helpers: {
					httpRequestWithAuthentication: jest.fn().mockRejectedValue(new Error('offline')),
				},
			};

			await expect(getRegoloModelOptions.call(ctx as any)).resolves.toEqual([]);
		});
	});
});

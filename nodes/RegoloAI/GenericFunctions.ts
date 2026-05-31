import type {
	IExecuteSingleFunctions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
	INodePropertyOptions,
	INodeProperties,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { BaseDocumentCompressor } from '@langchain/core/retrievers/document_compressors';
import type { DocumentInterface } from '@langchain/core/documents';

function isJsonObject(obj: unknown): obj is JsonObject {
	return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

export async function sendErrorPostReceive(
	this: IExecuteSingleFunctions,
	data: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const code = String(response.statusCode ?? '');
	if (code.startsWith('4') || code.startsWith('5')) {
		if (isJsonObject(response)) {
			throw new NodeApiError(this.getNode(), response);
		}
		throw new NodeApiError(this.getNode(), {
			message: 'Request failed',
			...response,
		} as JsonObject);
	}
	return data;
}
export function isString(val: unknown): val is string {
	return typeof val === 'string';
}

export async function dedupeOptionsPostReceive(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
	const seen = new Set<string>();

	return items.filter((item) => {
		const option = item.json as Record<string, unknown>;
		const key = String(option.value ?? option.name ?? '').trim().toLowerCase();

		if (!key) return true;
		if (seen.has(key)) return false;

		seen.add(key);
		return true;
	});
}

type RegoloCredentials = {
	apiKey: string;
	url: string;
};

type RegoloModelRecord = Record<string, unknown>;

export type RegoloModelFamily = 'chat' | 'embeddings' | 'rerank' | 'image' | 'ocr' | 'speechToText';

export type RegoloCommonOptions = {
	batchSize?: number;
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

export function normalizeBaseUrl(url?: string): string {
	return (url || 'https://api.regolo.ai/v1').replace(/\/+$/, '');
}

export function getModelsBaseUrl(url?: string): string {
	return normalizeBaseUrl(url).replace(/\/v1$/i, '');
}

function getModelName(model: unknown): string {
	if (typeof model === 'string') return model.trim();
	if (!isJsonObject(model)) return '';

	const record = model as RegoloModelRecord;
	const value = record.id ?? record.model_name ?? record.name;
	return typeof value === 'string' ? value.trim() : '';
}

function getModelsFromResponse(response: unknown): unknown[] {
	if (Array.isArray(response)) return response;
	if (!isJsonObject(response)) return [];

	const record = response as RegoloModelRecord;
	if (Array.isArray(record.data)) return record.data;
	if (Array.isArray(record.models)) return record.models;

	return [];
}

export function uniqueModelOptions(models: unknown[]): INodePropertyOptions[] {
	const uniqueModels = new Map<string, INodePropertyOptions>();

	for (const model of models) {
		const name = getModelName(model);
		if (!name) continue;

		const key = name.toLowerCase();
		if (!uniqueModels.has(key)) {
			uniqueModels.set(key, { name, value: name });
		}
	}

	return [...uniqueModels.values()].sort((a, b) =>
		String(a.name).localeCompare(String(b.name)),
	);
}

function modelMatchesFamily(modelName: string, family?: RegoloModelFamily): boolean {
	if (!family) return true;

	const lower = modelName.toLowerCase();
	const isEmbedding = /(^|[-_])(?:embed|embedding)|gte|bge|e5/.test(lower);
	const isRerank = /rerank|re-rank/.test(lower);
	const isImage = /image|flux|sdxl|stable-diffusion|dall-e|qwen-image/.test(lower);
	const isOcr = /ocr|vision/.test(lower);
	const isSpeech = /whisper|transcrib|speech|stt|audio/.test(lower);

	if (family === 'embeddings') return isEmbedding;
	if (family === 'rerank') return isRerank;
	if (family === 'image') return isImage;
	if (family === 'ocr') return isOcr;
	if (family === 'speechToText') return isSpeech;

	return !isEmbedding && !isRerank && !isImage && !isOcr && !isSpeech;
}

export function filterModelOptions(
	options: INodePropertyOptions[],
	family?: RegoloModelFamily,
): INodePropertyOptions[] {
	return options.filter((option) => modelMatchesFamily(String(option.value), family));
}

async function loadRegoloModelOptions(
	this: ILoadOptionsFunctions,
	family?: RegoloModelFamily,
): Promise<INodePropertyOptions[]> {
	const credentials = await this.getCredentials<RegoloCredentials>('regoloApi');
	const apiBaseUrl = normalizeBaseUrl(credentials.url);
	const modelsBaseUrl = getModelsBaseUrl(credentials.url);
	const candidates = [
		`${apiBaseUrl}/models`,
		`${modelsBaseUrl}/models`,
		`${modelsBaseUrl}/model/info`,
		`${apiBaseUrl}/model/info`,
	];

	for (const url of candidates) {
		try {
			const response = await this.helpers.httpRequestWithAuthentication.call(this, 'regoloApi', {
				method: 'GET',
				url,
				json: true,
			});
			const options = filterModelOptions(uniqueModelOptions(getModelsFromResponse(response)), family);
			if (options.length > 0) return options;
		} catch {
			// Try the next known Regolo catalog endpoint.
		}
	}

	return [];
}

export async function getRegoloModelOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return loadRegoloModelOptions.call(this);
}

export async function getRegoloChatModelOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return loadRegoloModelOptions.call(this, 'chat');
}

export async function getRegoloEmbeddingModelOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return loadRegoloModelOptions.call(this, 'embeddings');
}

export async function getRegoloRerankerModelOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return loadRegoloModelOptions.call(this, 'rerank');
}

export async function getRegoloImageModelOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return loadRegoloModelOptions.call(this, 'image');
}

export async function getRegoloOcrModelOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return loadRegoloModelOptions.call(this, 'ocr');
}

export async function getRegoloSpeechModelOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return loadRegoloModelOptions.call(this, 'speechToText');
}

export function resolveBaseUrl(credentials: RegoloCredentials, useCustomEndpoint: boolean): string {
	if (!useCustomEndpoint) return normalizeBaseUrl(credentials.url);
	return `${getModelsBaseUrl(credentials.url)}/custom-model/v1`;
}

export function resolveModel(selectedModel: string, customModel: string): string {
	return selectedModel === '__custom__' ? customModel : selectedModel;
}

export const modelProperties: INodeProperties[] = [
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
];

export class RegoloReranker extends BaseDocumentCompressor {
	constructor(
		private readonly config: {
			apiKey: string;
			baseUrl: string;
			model: string;
			topN: number;
		},
	) {
		super();
	}

	async compressDocuments(documents: DocumentInterface[], query: string): Promise<DocumentInterface[]> {
		const response = await fetch(`${getModelsBaseUrl(this.config.baseUrl)}/rerank`, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${this.config.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: this.config.model,
				query,
				documents: documents.map((document) => document.pageContent),
				top_n: this.config.topN,
			}),
		});

		if (!response.ok) {
			throw new Error(`Regolo rerank request failed with status ${response.status}`);
		}

		const body = (await response.json()) as {
			results?: Array<{ index?: number; relevance_score?: number; score?: number }>;
		};

		return (body.results ?? [])
			.filter((result) => typeof result.index === 'number' && documents[result.index])
			.map((result) => {
				const source = documents[result.index as number];
				return {
					...source,
					metadata: {
						...source.metadata,
						relevanceScore: result.relevance_score ?? result.score,
					},
				};
			});
	}
}

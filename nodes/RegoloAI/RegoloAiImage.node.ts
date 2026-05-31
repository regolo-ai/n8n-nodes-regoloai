import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	getRegoloImageModelOptions,
	isString,
	modelProperties,
	RegoloCommonOptions,
	resolveBaseUrl,
	resolveModel,
} from './GenericFunctions';

type RegoloCredentials = {
	apiKey: string;
	url: string;
};

export class RegoloAiImage implements INodeType {
	methods = {
		loadOptions: {
			getRegoloModelOptions: getRegoloImageModelOptions,
		},
	};

	description: INodeTypeDescription = {
		displayName: 'Regolo AI Image',
		name: 'regoloAiImage',
		icon: 'file:regoloai.svg',
		group: ['transform'],
		version: 1,
		description: 'Generate images with Regolo AI',
		defaults: { name: 'Regolo AI Image' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'regoloApi', required: true }],
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Tools', 'Root Nodes'] },
			resources: { primaryDocumentation: [{ url: 'https://docs.regolo.ai/' }] },
			alias: ['regolo', 'image', 'generate image'],
		},
		properties: [
			...modelProperties,
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				default: '',
				required: true,
				typeOptions: { rows: 3 },
			},
			{
				displayName: 'Response Format',
				name: 'imageResponseFormat',
				type: 'options',
				default: 'binaryData',
				options: [
					{ name: 'Binary File', value: 'binaryData' },
					{ name: 'Image URL', value: 'imageUrl' },
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Number of Images',
						name: 'n',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 1, maxValue: 10 },
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

			const useCustomEndpoint = this.getNodeParameter('useCustomEndpoint', itemIndex, false) as boolean;
			const prompt = this.getNodeParameter('prompt', itemIndex) as string;
			const imageResponseFormat = this.getNodeParameter(
				'imageResponseFormat',
				itemIndex,
				'binaryData',
			) as string;
			const options = this.getNodeParameter('options', itemIndex, {}) as RegoloCommonOptions;
			const response = await this.helpers.httpRequestWithAuthentication.call(this, 'regoloApi', {
				method: 'POST',
				url: `${resolveBaseUrl(credentials, useCustomEndpoint)}/images/generations`,
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
				continue;
			}

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

		return [returnData];
	}
}

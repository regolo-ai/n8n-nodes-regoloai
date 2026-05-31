import type { INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { dedupeOptionsPostReceive, isString, sendErrorPostReceive } from './GenericFunctions';
import { Buffer } from 'buffer';

export const imageOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: { resource: ['image'] },
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create an image',
				description: 'Create an image for a given text',
				routing: {
					request: {
						method: 'POST',
						url: '/images/generations',
					},
					output: { postReceive: [sendErrorPostReceive] },
				},
			},
		],
		routing: {
			output: {
				postReceive: [
					{
						type: 'rootProperty',
						properties: { property: 'data' },
					},
				],
			},
		},
		default: 'create',
	},
];

const createOperations: INodeProperties[] = [
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		placeholder: 'e.g. A cat sitting on the Colosseum steps at sunset',
		description: 'Text description of the desired image(s)',
		displayOptions: {
			show: { resource: ['image'], operation: ['create'] },
		},
		default: '',
		routing: {
			send: { type: 'body', property: 'prompt' },
		},
	},

	{
		displayName: 'Model',
		name: 'model',
		type: 'options',
		description: 'Model to use for image generation',
		displayOptions: { show: { resource: ['image'], operation: ['create'] } },
		default: '__custom__',
		typeOptions: {
			loadOptions: {
				routing: {
					request: { method: 'GET', url: '/model/info' },
					output: {
						postReceive: [
							{ type: 'rootProperty', properties: { property: 'data' } },
							{
								type: 'filter',
								properties: {
									pass: "={{ String($responseItem.model_info?.mode || '').toLowerCase() === 'image_generation' }}",
								},
							},
							{
								type: 'setKeyValue',
								properties: {
									name: '={{ $responseItem.model_name }}',
									value: '={{ $responseItem.model_name }}',
								},
							},
							dedupeOptionsPostReceive,
							{ type: 'sort', properties: { key: 'name' } },
						],
					},
				},
			},
		},
		options: [{ name: 'Custom (Type Manually)', value: '__custom__' }],
		routing: {
			send: {
				type: 'body',
				property: 'model',
				value: '={{ $value === "__custom__" ? $parameter["customImageModel"] : $value }}',
			},
		},
	},

	{
		displayName: 'Custom Model',
		name: 'customImageModel',
		type: 'string',
		placeholder: 'e.g. Qwen-Image',
		displayOptions: { show: { resource: ['image'], operation: ['create'], model: ['__custom__'] } },
		default: '',
	},

	{
		displayName: 'Response Format',
		name: 'responseFormat',
		type: 'options',
		default: 'binaryData',
		description: 'Format in which to return the image(s)',
		displayOptions: {
			show: { resource: ['image'], operation: ['create'] },
		},
		options: [
			{ name: 'Binary File', value: 'binaryData' },
			{ name: 'Image Url', value: 'imageUrl' },
		],
		routing: {
			send: {
				type: 'body',
				property: 'response_format',
				value: '={{ $value === "imageUrl" ? "url" : "b64_json" }}',
			},
			output: {
				postReceive: [
					async function (items: INodeExecutionData[]): Promise<INodeExecutionData[]> {
						if (this.getNode().parameters.responseFormat === 'imageUrl') {
							return items;
						}
						const result: INodeExecutionData[] = [];
						for (let i = 0; i < items.length; i++) {
							const b64 = (items[i].json as Record<string, unknown>).b64_json;
							if (!isString(b64)) {
								throw new Error('Expected b64_json to be a string in image response');
							}

							result.push({
								json: {},
								binary: {
									data: await this.helpers.prepareBinaryData(
										Buffer.from(b64, 'base64'),
										'image.png',
										'image/png',
									),
								},
							} as INodeExecutionData);
						}
						return result;
					},
				],
			},
		},
	},

	{
		displayName: 'Options',
		name: 'options',
		placeholder: 'Add option',
		description: 'Additional options',
		type: 'collection',
		default: {},
		displayOptions: {
			show: { resource: ['image'], operation: ['create'] },
		},
		options: [
			{
				displayName: 'Number of Images',
				name: 'n',
				type: 'number',
				default: 1,
				typeOptions: { minValue: 1, maxValue: 10 },
				routing: { send: { type: 'body', property: 'n' } },
			},
			{
				displayName: 'Resolution',
				name: 'size',
				type: 'options',
				options: [
					{ name: '256x256', value: '256x256' },
					{ name: '512x512', value: '512x512' },
					{ name: '1024x1024', value: '1024x1024' },
				],
				default: '1024x1024',
				routing: { send: { type: 'body', property: 'size' } },
			},
		],
	},
];

export const imageFields: INodeProperties[] = [
	/* ------------------------------- image:create ------------------------------ */
	...createOperations,
];

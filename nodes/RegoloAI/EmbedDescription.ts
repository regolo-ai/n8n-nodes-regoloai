import type { INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { dedupeOptionsPostReceive, sendErrorPostReceive } from './GenericFunctions';

export const textOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['text'] } },
		options: [
			{
				name: 'Embeddings',
				value: 'embed',
				action: 'Create embeddings',
				description: 'Generate vector embeddings for text input',
				routing: {
					request: { method: 'POST', url: '/embeddings' },
					output: { postReceive: [sendErrorPostReceive] },
				},
			},
		],
		default: 'embed',
	},
];

const embedOperations: INodeProperties[] = [
	{
		displayName: 'Model',
		name: 'embedModel',
		type: 'options',
		description: 'The embedding model to use',
		displayOptions: { show: { operation: ['embed'], resource: ['text'] } },
		default: '__custom__',
		typeOptions: {
			loadOptions: {
				routing: {
					request: {
						method: 'GET',
						url: '/model/info',
					},
					output: {
						postReceive: [
							{ type: 'rootProperty', properties: { property: 'data' } },
							{
								type: 'filter',
								properties: {
									pass: "={{ String($responseItem.model_info?.mode || '').toLowerCase() === 'embedding' }}",
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
				value: '={{ $value === "__custom__" ? $parameter["customEmbedModel"] : $value }}',
			},
		},
	},
	{
		displayName: 'Custom Model',
		name: 'customEmbedModel',
		type: 'string',
		description: 'Type a custom embedding model ID',
		placeholder: 'e.g. gte-qwen2',
		displayOptions: {
			show: { resource: ['text'], operation: ['embed'], embedModel: ['__custom__'] },
		},
		default: '',
	},

	{
		displayName: 'Input',
		name: 'input',
		type: 'string',
		description: 'Text to embed (use a short sentence or paragraph)',
		placeholder: 'e.g. The food was delicious and the waiter...',
		displayOptions: { show: { resource: ['text'], operation: ['embed'] } },
		default: '',
		typeOptions: { rows: 2 },
		routing: { send: { type: 'body', property: 'input' } },
	},
];

/* -------------------------------------------------------------------------- */
/*                               text:shared                                   */
/* -------------------------------------------------------------------------- */
const sharedOperations: INodeProperties[] = [
	// Simplify for embeddings (schema OpenAI-like: data[].embedding)
	{
		displayName: 'Simplify',
		name: 'simplifyEmbeddings',
		type: 'boolean',
		default: true,
		displayOptions: { show: { operation: ['embed'], resource: ['text'] } },
		// eslint-disable-next-line n8n-nodes-base/node-param-description-boolean-without-whether
		description: 'Return a simplified array of embeddings instead of the raw response',
		routing: {
			output: {
				postReceive: [
					{
						type: 'set',
						enabled: '={{$value}}',
						properties: { value: '={{ { "data": $response.body.data } }}' },
					},
					{
						type: 'rootProperty',
						enabled: '={{$value}}',
						properties: { property: 'data' },
					},
					async function (items: INodeExecutionData[]): Promise<INodeExecutionData[]> {
						if (this.getNode().parameters.simplifyEmbeddings === false) {
							return items;
						}
						return items.map((item) => ({
							json: {
								index: item.json.index,
								embedding: item.json.embedding,
							},
						}));
					},
				],
			},
		},
	},
];

export const textFields: INodeProperties[] = [...embedOperations, ...sharedOperations];

import type { INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { dedupeOptionsPostReceive, sendErrorPostReceive } from './GenericFunctions';

export const chatOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['chat'] } },
		options: [
			{
				name: 'Complete',
				value: 'complete',
				action: 'Create a chat completion',
				description: 'Create one or more chat completions from a list of messages',
				routing: {
					request: { method: 'POST', url: '/chat/completions' },
					output: { postReceive: [sendErrorPostReceive] },
				},
			},
		],
		default: 'complete',
	},
];

const completeOperations: INodeProperties[] = [
	{
		displayName: 'Model',
		name: 'model',
		type: 'options',
		description: 'The model used to generate the completion',
		displayOptions: { show: { resource: ['chat'], operation: ['complete'] } },
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
									pass: "={{ String($responseItem.model_info?.mode || '').toLowerCase() === 'chat' }}",
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
				value: '={{ $value === "__custom__" ? $parameter["customModel"] : $value }}',
			},
		},
	},

	{
		displayName: 'Custom Model',
		name: 'customModel',
		type: 'string',
		default: '',
		placeholder: 'e.g. llama-3.1-70b-instruct',
		description: 'Type a custom model ID',
		displayOptions: {
			show: {
				resource: ['chat'],
				operation: ['complete'],
				model: ['__custom__'],
			},
		},
	},

	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'fixedCollection',
		typeOptions: { sortable: true, multipleValues: true },
		displayOptions: { show: { resource: ['chat'], operation: ['complete'] } },
		placeholder: 'Add Message',
		default: {},
		options: [
			{
				displayName: 'Messages',
				name: 'messages',
				values: [
					{
						displayName: 'Role',
						name: 'role',
						type: 'options',
						options: [
							{ name: 'Assistant', value: 'assistant' },
							{ name: 'System', value: 'system' },
							{ name: 'User', value: 'user' },
						],
						default: 'user',
					},
					{
						displayName: 'Content',
						name: 'content',
						type: 'string',
						default: '',
					},
				],
			},
		],
		routing: {
			send: {
				type: 'body',
				property: 'messages',
				value: '={{ $value.messages }}',
			},
		},
	},
];

const sharedOperations: INodeProperties[] = [
	{
		displayName: 'Simplify',
		name: 'simplifyOutput',
		type: 'boolean',
		default: true,
		displayOptions: { show: { operation: ['complete'], resource: ['chat'] } },
		description: 'Whether to return a simplified version of the response instead of the raw data',
		routing: {
			output: {
				postReceive: [
					async function (items: INodeExecutionData[]): Promise<INodeExecutionData[]> {
						const simplify = this.getNode().parameters.simplifyOutput;
						if (!simplify) return items;

						return items.map((item) => {
							const src = (item?.json as any) ?? {};
							const body = src?.body ?? src;

							const choices = body?.choices ?? [];
							let text = '';

							for (const c of choices) {
								const piece = c?.message?.content ?? c?.delta?.content ?? c?.text ?? '';
								if (piece) text += (text ? '\n' : '') + String(piece);
							}

							if (!text && typeof body === 'string') text = body;
							if (!text && typeof src === 'string') text = src;

							const out = {
								text: (text ?? '').toString().trim(),
								model: body?.model ?? src?.model ?? null,
								usage: body?.usage ?? src?.usage ?? null,
								finish_reason: choices?.[0]?.finish_reason ?? null,
								raw: body,
							};

							return { json: out };
						});
					},
				],
			},
		},
	},

	{
		displayName: 'Options',
		name: 'options',
		placeholder: 'Add option',
		description: 'Additional options to add',
		type: 'collection',
		default: {},
		displayOptions: { show: { operation: ['complete'], resource: ['chat'] } },
		// eslint-disable-next-line n8n-nodes-base/node-param-collection-type-unsorted-items
		options: [
			{
				displayName: 'Echo Prompt',
				name: 'echo',
				type: 'boolean',
				default: false,
				// eslint-disable-next-line n8n-nodes-base/node-param-description-boolean-without-whether
				description: 'Echo the prompt back in addition to the completion',
				routing: { send: { type: 'body', property: 'echo' } },
			},
			{
				displayName: 'Frequency Penalty',
				name: 'frequency_penalty',
				type: 'number',
				default: 0,
				typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
				routing: { send: { type: 'body', property: 'frequency_penalty' } },
			},
			{
				displayName: 'Maximum Number of Tokens',
				name: 'maxTokens',
				type: 'number',
				default: 256,
				typeOptions: { maxValue: 32768 },
				description: 'Maximum tokens to generate in the completion',
				routing: { send: { type: 'body', property: 'max_tokens' } },
			},
			{
				displayName: 'Number of Completions',
				name: 'n',
				type: 'number',
				default: 1,
				routing: { send: { type: 'body', property: 'n' } },
			},
			{
				displayName: 'Presence Penalty',
				name: 'presence_penalty',
				type: 'number',
				default: 0,
				typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
				routing: { send: { type: 'body', property: 'presence_penalty' } },
			},
			{
				displayName: 'Sampling Temperature',
				name: 'temperature',
				type: 'number',
				default: 0.7,
				typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
				routing: { send: { type: 'body', property: 'temperature' } },
			},
			{
				displayName: 'Top P',
				name: 'topP',
				type: 'number',
				default: 1,
				typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
				description: 'Nucleus sampling',
				routing: { send: { type: 'body', property: 'top_p' } },
			},
		],
	},
];

export const chatFields: INodeProperties[] = [
	/* ------------------------------ chat:complete ------------------------------ */
	...completeOperations,

	/* -------------------------------- chat:ALL -------------------------------- */
	...sharedOperations,
];

import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { getRegoloSpeechModelOptions, modelProperties, resolveBaseUrl, resolveModel } from './GenericFunctions';

type RegoloCredentials = {
	apiKey: string;
	url: string;
};

export class RegoloAiSpeechToText implements INodeType {
	methods = {
		loadOptions: {
			getRegoloModelOptions: getRegoloSpeechModelOptions,
		},
	};

	description: INodeTypeDescription = {
		displayName: 'Regolo AI Speech to Text',
		name: 'regoloAiSpeechToText',
		icon: 'file:regoloai.svg',
		group: ['transform'],
		version: 1,
		description: 'Transcribe audio with Regolo AI speech-to-text models',
		defaults: { name: 'Regolo AI Speech to Text' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'regoloApi', required: true }],
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Tools', 'Root Nodes'] },
			resources: { primaryDocumentation: [{ url: 'https://docs.regolo.ai/' }] },
			alias: ['regolo', 'whisper', 'speech to text', 'transcription'],
		},
		properties: [
			...modelProperties,
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property that contains the audio file',
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

			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
			const binaryData = items[itemIndex].binary?.[binaryPropertyName];
			if (!binaryData) {
				throw new NodeOperationError(
					this.getNode(),
					`No binary data property "${binaryPropertyName}" found`,
					{ itemIndex },
				);
			}

			const useCustomEndpoint = this.getNodeParameter('useCustomEndpoint', itemIndex, false) as boolean;
			const audio = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
			const response = await this.helpers.httpRequestWithAuthentication.call(this, 'regoloApi', {
				method: 'POST',
				url: `${resolveBaseUrl(credentials, useCustomEndpoint)}/audio/transcriptions`,
				formData: {
					model,
					file: {
						value: audio,
						options: {
							filename: binaryData.fileName ?? 'audio.wav',
							contentType: binaryData.mimeType,
						},
					},
				},
				json: true,
			} as any);

			returnData.push({ json: response });
		}

		return [returnData];
	}
}

const { RegoloAi } = require('./dist/nodes/RegoloAI/RegoloAi.node');
const { RegoloAiChatModel } = require('./dist/nodes/RegoloAI/RegoloAiChatModel.node');
const { RegoloAiEmbeddings } = require('./dist/nodes/RegoloAI/RegoloAiEmbeddings.node');
const { RegoloAiReranker } = require('./dist/nodes/RegoloAI/RegoloAiReranker.node');
const { RegoloAiImage } = require('./dist/nodes/RegoloAI/RegoloAiImage.node');
const { RegoloAiOcr } = require('./dist/nodes/RegoloAI/RegoloAiOcr.node');
const { RegoloAiSpeechToText } = require('./dist/nodes/RegoloAI/RegoloAiSpeechToText.node');
const { RegoloApi } = require('./dist/credentials/RegoloApi.credentials');

module.exports = {
	RegoloAi,
	RegoloAiChatModel,
	RegoloAiEmbeddings,
	RegoloAiReranker,
	RegoloAiImage,
	RegoloAiOcr,
	RegoloAiSpeechToText,
	RegoloApi,
};
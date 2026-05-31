# n8n-nodes-regoloai

This is an n8n community node. It lets you use **RegoloAI** in your n8n workflows.

RegoloAI is an European, green, OpenAI-compatible inference provider offering endpoints for *chat completions*, *embeddings*, *reranking*, *OCR*, *speech to text*, and *image generation*, making it easy to integrate advanced AI features into your automations.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)    
[Resources](#resources)

--- 
## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

```bash
npm install n8n-nodes-regoloai
```

After installation, restart n8n. You will find dedicated **Regolo AI** nodes in the editor.

---

## Operations

The package exposes dedicated nodes for each Regolo capability:

### **Regolo AI Chat Model**

* Supplies an **AI Chat Model** output for n8n AI Agent, Basic LLM Chain, and compatible AI nodes

### **Regolo AI Embeddings**

* Supplies an **AI Embeddings** output for vector stores and compatible AI workflows

### **Regolo AI Reranker**

* Supplies an **AI Reranker** output for compatible retrieval and vector-store workflows

### **Regolo AI Image**

* Creates images from a text prompt
* Returns results as **image URLs** or **binary files** (PNG)

### **Regolo AI OCR**

* Sends image URLs, data URLs, base64 images, or binary image files to OCR/vision-capable Regolo models

### **Regolo AI Speech to Text**

* Transcribe audio with Regolo speech-to-text models such as Whisper-compatible models

---

## Credentials

To use this node, you need a **Regolo AI API Key**.

1. Sign up or log in at [RegoloAI](https://regolo.ai).
2. Go to your dashboard and create an API key.
3. In n8n, add new credentials:

	* **API Key**: paste the key you generated
	* **Base URL**: defaults to `https://api.regolo.ai/v1` 

The credentials use **Bearer token authentication**.

---

## Compatibility

* **Minimum n8n version**: a recent self-hosted n8n version with community AI node support
* **Node.js version**: >= 20.19 < 25
* Tested with: Regolo AI API (OpenAI-compatible endpoints)

There are no known incompatibilities.

---

## Usage

* To use Regolo as the model for an n8n AI Agent or Basic LLM Chain, add **Regolo AI Chat Model** and connect it to the model input.
* To use Regolo embeddings in vector workflows, add **Regolo AI Embeddings** where n8n asks for an embeddings model.
* To use Regolo reranking, add **Regolo AI Reranker** where n8n asks for a reranker.
* To call image generation, OCR, or speech-to-text as regular workflow steps, add the dedicated **Regolo AI Image**, **Regolo AI OCR**, or **Regolo AI Speech to Text** node.
* Configure the parameters (model, prompt, options).
* Connect the node to other n8n nodes to automate your AI-driven workflows.

### Notes

* The older combined **Regolo AI** node is kept hidden for workflow compatibility, but new workflows should use the dedicated nodes.
* Models are dynamically loaded from Regolo catalog endpoints when available.
* When selecting **Custom (Type Manually)**, you must provide a valid model ID in the **Custom Model** field.
* For image generation, you can choose to return either **URLs** or **binary PNGs**.
* For private/custom deployed Regolo models, enable **Use Custom Model Endpoint**.

---

## Resources

* [n8n Community Nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* [RegoloAI documentation](https://docs.regolo.ai/)
* [RegoloAI](https://api.regolo.ai/)
* [n8n](https://n8n.io)

---

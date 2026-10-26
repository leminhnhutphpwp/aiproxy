# RAG & Vector Search

## Core Principles
- **Grounding**: LLM output is grounded in retrieved documents — reduces hallucination
- **Chunking Strategy**: Document chunk size and overlap determine retrieval quality
- **Vector Similarity**: Semantic search via embedding similarity (cosine, dot product, Euclidean)
- **Hybrid Retrieval**: Combine vector search with keyword (BM25) for best results

## Key Patterns
- **Naive RAG**: Chunk → Embed → Index → Retrieve → Augment → Generate
- **Advanced RAG**: Query rewriting, HyDE (query → hypothetical doc → embed), re-ranking
- **Multi-Hop RAG**: Decompose complex queries into sub-queries, retrieve for each, combine
- **Agentic RAG**: Agent decides when and what to retrieve, iterates with tools
- **Parent Document Retriever**: Retrieve small chunks, return parent document for full context
- **Graph RAG**: Build knowledge graph from docs, retrieve by traversal + vector similarity

## Best Practices
- Tune chunk size (256-1024 tokens) and overlap (10-20%) to your document type
- Always re-rank top-k results with a cross-encoder (Cohere, BGE) before LLM
- Store metadata (source, date, page) with every vector — enable filtered retrieval
- Use hybrid search (vector + keyword) — vector alone misses exact keyword matches
- Clean documents before chunking (remove boilerplate, normalize whitespace)
- Consider multi-vector indexing (document summary + chunks) for better retrieval
- Monitor retrieval metrics: hit rate, mean reciprocal rank, precision@k

## Common Pitfalls
- **Garbage chunks**: Chunks with no coherent meaning produce bad retrievals — use semantic chunking
- **Context stuffing**: Too many retrieved chunks exceed LLM context — limit to 3-5 relevant chunks
- **Missing metadata**: No way to filter or attribute sources — always store provenance
- **Outdated vectors**: Documents change but embeddings stay stale — re-index on update
- **One-size model**: Different document types need different embedding models — test and compare

## Tools & Ecosystem
- **Chroma / Qdrant / Pinecone / Weaviate**: Vector databases
- **LlamaIndex / LangChain**: RAG orchestration frameworks
- **Voyage / Cohere / BGE / OpenAI**: Embedding models
- **Cohere Rerank / BGE Reranker**: Cross-encoder re-ranking models
- **Unstructured / LlamaParse**: Document parsing and chunking
- **Ragas / TruLens**: RAG evaluation (faithfulness, relevance, context precision)

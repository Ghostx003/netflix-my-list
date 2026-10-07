import time
from llama_cpp import Llama

model_path = "models/qwen2.5-3b-instruct-q4_k_m.gguf"
print(f"Loading {model_path} into llama_cpp (n_ctx=2048, n_threads=4)...")
t0 = time.time()
llm = Llama(
    model_path=model_path,
    n_ctx=2048,
    n_threads=4,
    verbose=False
)
load_time = time.time() - t0
print(f"Model loaded in {load_time:.2f} seconds.")

prompt = "<|im_start|>user\nReply in one short sentence: What is your name and architecture?<|im_end|>\n<|im_start|>assistant\n"
t1 = time.time()
output = llm(prompt, max_tokens=64, stop=["<|im_end|>"])
infer_time = time.time() - t1

text = output["choices"][0]["text"].strip()
print(f"Inference output ({infer_time:.2f}s): {text}")

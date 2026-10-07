import importlib

for pkg in ['llama_cpp', 'ctransformers', 'vllm', 'torch', 'transformers', 'huggingface_hub', 'urllib']:
    try:
        m = importlib.import_module(pkg)
        ver = getattr(m, '__version__', 'N/A')
        print(f"{pkg}: available, version {ver}")
    except Exception as e:
        print(f"{pkg}: NOT available ({e})")

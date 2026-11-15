# Run in Google Colab (T4 GPU):
# !pip install --upgrade --force-reinstall --no-cache-dir unsloth unsloth_zoo

import torch
from datasets import load_dataset
from unsloth import FastLanguageModel
from unsloth.chat_templates import get_chat_template
from trl import SFTTrainer, SFTConfig

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Qwen3-8B",
    max_seq_length=2048,
    load_in_4bit=True,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=3407,
)

tokenizer = get_chat_template(tokenizer, chat_template="qwen-3")
dataset = load_dataset("json", data_files="astrovitals_train.jsonl", split="train")


def format_prompts(examples):
    texts = [
        tokenizer.apply_chat_template(convo, tokenize=False, add_generation_prompt=False)
        for convo in examples["messages"]
    ]
    return {"text": texts}


dataset = dataset.map(format_prompts, batched=True)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    args=SFTConfig(
        dataset_text_field="text",
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=10,
        num_train_epochs=2,
        learning_rate=2e-4,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=10,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        seed=3407,
        output_dir="astrovitals_outputs",
    ),
)

trainer.train()

model.save_pretrained_gguf("astrovitals_qwen3_gguf", tokenizer, quantization_method="q4_k_m")
print("Export complete! Download the .gguf file and load into Ollama with: FROM ./astrovitals-qwen3.gguf")


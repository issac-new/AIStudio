# New Research Team Tool-Landscape Subtask Checklist

Use when a domain-specific research team (aiteam, [已移除], hack-x, etc.) asks to cover a concrete list of inference/training/simulation tools.

## Checklist for the tool-landscape subtask

- [ ] Confirm each tool's official repo or authoritative docs URL (GitHub, docs site, arXiv if paper-first)
- [ ] Identify tool category: local inference server / desktop experiment UI / training framework / simulator / benchmark harness
- [ ] Note primary backends: llama.cpp, PyTorch, JAX, MLX, ONNX, TensorRT-LLM
- [ ] Capture hardware sweet spots: Apple Silicon / NVIDIA / cloud / edge
- [ ] Document minimal working example (CLI or Python) that can be run locally or in workspace
- [ ] Compare against 2-3 alternatives in the same category
- [ ] Map to team profiles: which role owns each tool, who consumes its output
- [ ] Update the capability-matrix document with the real tool-chain mapping

## Common tool categories and example tools

| Category | Examples |
|---|---|
| Local inference servers | Ollama, LM Studio, vLLM, SGLang, llama.cpp, TGI |
| Training/fine-tuning | LLaMA-Factory, Axolotl, Unsloth, TRL, veRL, Open-Instruct |
| Apple Silicon native | MLX, mlx-lm, mlx-vlm |
| Robotics simulators | Isaac Gym, Isaac Sim, MuJoCo, PyBullet, SimplerEnv, RoboCasa |
| RL post-training | veRL, OpenRLHF, verl, slime, trl |

## Output format

Produce a markdown file in the parent task workspace named `<team>-tool-landscape.md` with:
- Tool-by-tool architecture/usage notes
- Comparison matrix
- Profile mapping section
- Source URLs for every claim

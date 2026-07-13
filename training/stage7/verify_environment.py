import argparse
import math
import sys

import torch


EXPECTED_PYTHON = (3, 12)
EXPECTED_TORCH = "2.13.0+cu130"
EXPECTED_CUDA_RUNTIME = "13.0"
EXPECTED_GPU_NAME = "RTX 4060"


def verify_cpu() -> None:
    if sys.version_info[:2] != EXPECTED_PYTHON:
        raise RuntimeError(
            f"expected Python {EXPECTED_PYTHON[0]}.{EXPECTED_PYTHON[1]}, "
            f"found {sys.version_info.major}.{sys.version_info.minor}"
        )
    if torch.__version__ != EXPECTED_TORCH:
        raise RuntimeError(f"expected torch {EXPECTED_TORCH}, found {torch.__version__}")
    if torch.version.cuda != EXPECTED_CUDA_RUNTIME:
        raise RuntimeError(
            f"expected PyTorch CUDA runtime {EXPECTED_CUDA_RUNTIME}, found {torch.version.cuda}"
        )

    torch.manual_seed(7101)
    inputs = torch.arange(1, 17, dtype=torch.float32, device="cpu").reshape(4, 4)
    weights = torch.eye(4, dtype=torch.float32, device="cpu", requires_grad=True)
    loss = (inputs @ weights).square().mean()
    loss.backward()

    if not math.isfinite(loss.item()):
        raise RuntimeError("CPU forward pass produced a non-finite loss")
    if weights.grad is None or not torch.isfinite(weights.grad).all().item():
        raise RuntimeError("CPU backward pass produced invalid gradients")


def verify_cuda() -> tuple[str, tuple[int, int]]:
    if not torch.cuda.is_available():
        raise RuntimeError("torch.cuda.is_available() is false")

    device = torch.device("cuda:0")
    device_name = torch.cuda.get_device_name(device)
    if EXPECTED_GPU_NAME not in device_name:
        raise RuntimeError(f"expected an {EXPECTED_GPU_NAME}, found {device_name}")

    torch.cuda.manual_seed_all(7101)
    inputs = torch.arange(1, 4097, dtype=torch.float32, device=device).reshape(64, 64)
    output = inputs @ inputs.transpose(0, 1)
    torch.cuda.synchronize(device)

    if not torch.isfinite(output).all().item():
        raise RuntimeError("CUDA matrix multiplication produced non-finite values")

    return device_name, torch.cuda.get_device_capability(device)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the pinned Stage 7 WSL environment.")
    parser.add_argument(
        "--require-cuda",
        action="store_true",
        help="also require the WSL RTX 4060 CUDA smoke path",
    )
    args = parser.parse_args()

    verify_cpu()
    print(f"python: {sys.version.split()[0]}")
    print(f"torch: {torch.__version__}")
    print(f"torch_cuda_runtime: {torch.version.cuda}")
    print("cpu_smoke: ok")

    if not args.require_cuda:
        print("cuda_smoke: skipped")
        return 0

    device_name, capability = verify_cuda()
    print(f"cuda_device: {device_name}")
    print(f"cuda_capability: {capability[0]}.{capability[1]}")
    print("cuda_smoke: ok")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        raise SystemExit(f"environment verification failed: {error}") from error

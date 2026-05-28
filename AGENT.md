# Agent Collaboration Notes

## Project Overview

- Project name: Minecraft Constructing Agents.
- Course context: a course project for building an intelligent agent system related to large language model agents.
- Goal: turn a Chinese natural-language Minecraft house request into a Minecraft Java 1.21 datapack that can build the requested structure in a single-player creative superflat world.
- Current v1 focus: a command-line multi-agent prototype, not a live Mineflayer bot.
- Main demo flow: user prompt -> requirement parsing -> house design -> blueprint generation -> validation -> Minecraft datapack export.

## Project Requirements

- Target game version: Minecraft Java 1.21 / 1.21.1.
- Datapack format: `pack_format: 48`.
- Datapack function path: `data/architect/function/`, using the singular `function` directory required by Minecraft 1.21.
- User command:
  - Run locally with `npm start -- "建一个欧式大房子"`.
  - In Minecraft, run `/reload`, `/function architect:clear`, then `/function architect:build`.
- Required generated artifacts under `out/<timestamp>/`:
  - `blueprint.json`
  - `architect_datapack/`
  - `raw_build.mcfunction`
  - `preview.html`
  - `run_report.md`
- The default pipeline must work without an API key by using fallback rules.
- When a Zhipu API key is available in local `.env`, the project may use LLM parsing through the OpenAI-compatible chat completions endpoint.
- Never commit `.env` or any API key. Keep API keys local only.
- Do not commit generated `out/` artifacts, local temp files, or the course PDF.
- Before finishing meaningful code changes, run `npm test`.

## Current Scope

- Implemented: Node.js ESM CLI, requirement agent, design agent, blueprint agent, validator agent, exporter, 1.21 datapack output, local HTML preview, and tests.
- Implemented build style: generic European/two-story house works as the strongest v1 demo.
- Partially implemented: LLM can parse other styles such as Jiangnan/Chinese, but the design and blueprint agents still need style-specific architecture modules for faithful results.
- Out of scope for v1: Mineflayer server control, survival-mode resource gathering, real player-like block placement, and downloading or launching Minecraft locally.

## Development Commands

- Run tests: `npm test`
- Generate demo output: `npm start -- "建一个欧式大房子"`
- Force fallback mode: `npm start -- --mode mock "建一个欧式大房子"`
- Force LLM mode: `npm start -- --mode llm "请建一个有江南水乡风格的中式小两层"`

## Repository

- GitHub: https://github.com/CityC196/Minecraft-Constructing-Agents.git
- Primary branch: `main`

## Sync Policy

- Before making code changes, always check whether the local repository is synchronized with GitHub.
- Run `git fetch origin`, then compare `HEAD` with `origin/main`.
- If the local repository and GitHub are not synchronized, treat GitHub as the source of truth.
- Prefer updating local code from `origin/main` before editing. Do not overwrite uncommitted local work silently; first report the difference and preserve or resolve it deliberately.
- Do not commit or push unrelated generated files, local secrets, course PDFs, or `out/` artifacts.

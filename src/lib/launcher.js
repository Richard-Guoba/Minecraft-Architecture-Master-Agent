import { spawn } from 'node:child_process';

export function launchConfiguredMinecraft({ launchCommand }) {
  const command = launchCommand || process.env.MINECRAFT_LAUNCH_COMMAND;
  if (!command) {
    throw new Error('Set MINECRAFT_LAUNCH_COMMAND or pass --launch-command before using --launch.');
  }

  const child = spawn(command, {
    shell: true,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return { command };
}

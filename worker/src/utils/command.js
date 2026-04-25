import { spawn } from "child_process";

const wireStream = (stream, onLine) => {
  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (trimmed) {
        Promise.resolve(onLine(trimmed)).catch((error) => {
          console.error("Failed to process stream line:", error);
        });
      }
    }
  });

  stream.on("end", () => {
    const trimmed = buffer.trimEnd();
    if (trimmed) {
      Promise.resolve(onLine(trimmed)).catch((error) => {
        console.error("Failed to process stream line:", error);
      });
    }
  });
};

export const runCommandStreaming = ({
  command,
  args = [],
  cwd,
  env = process.env,
  onLine
}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false
    });

    wireStream(child.stdout, onLine);
    wireStream(child.stderr, onLine);

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });

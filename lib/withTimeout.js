export async function withTimeout(promise, ms = 8000, message = 'Timeout') {
  return await Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(message)), ms)),
  ]);
}

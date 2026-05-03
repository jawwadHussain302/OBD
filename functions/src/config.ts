export const getAiApiKey = (): string | null => {
  return process.env.AI_API_KEY || null;
};

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const extractJobData = async (text) => {
  try {
    const prompt = `
Extract the following from this job message:

- company
- role
- location
- email
- skills
- experience

Return ONLY valid JSON.

Job Message:
${text}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",

      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: 0,
    });

    const output = response.choices[0].message.content;

    const cleanedOutput = output
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleanedOutput);

  } catch (error) {
    console.log("❌ AI Error:", error.message);

    return null;
  }
};

module.exports = extractJobData;
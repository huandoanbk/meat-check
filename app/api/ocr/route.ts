import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3MB size cap
const OPENAI_BASE_URL = "https://api.deepinfra.com/v1/openai";

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPINFRA_API_KEY;
  const model = process.env.DEEPINFRA_MODEL;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing DEEPINFRA_API_KEY environment variable" },
      { status: 500 }
    );
  }

  if (!model) {
    return NextResponse.json(
      { error: "Missing DEEPINFRA_MODEL environment variable" },
      { status: 500 }
    );
  }

  if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Content-Type must be multipart/form-data" },
      { status: 400 }
    );
  }

  let file: File | null = null;

  try {
    const formData = await req.formData();
    const maybeFile = formData.get("image");

    if (!(maybeFile instanceof File)) {
      return NextResponse.json(
        { error: "Field 'image' is required and must be a file" },
        { status: 400 }
      );
    }

    if (maybeFile.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Max size is 3MB" },
        { status: 413 }
      );
    }

    file = maybeFile;
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart/form-data payload" },
      { status: 400 }
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "application/octet-stream";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const client = new OpenAI({
      apiKey,
      baseURL: OPENAI_BASE_URL,
    });

    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
    });

    const message = completion.choices?.[0]?.message;
    const text =
      typeof message?.content === "string"
        ? message.content
        : Array.isArray(message?.content)
          ? (message.content as Array<{ type: string; text?: string }>)
              .map((part) => (part.type === "text" ? part.text ?? "" : ""))
              .filter(Boolean)
              .join("\n")
          : "";

    const usage = {
      prompt_tokens: completion.usage?.prompt_tokens ?? 0,
      completion_tokens: completion.usage?.completion_tokens ?? 0,
    };

    return NextResponse.json({ text, usage });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error occurred";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

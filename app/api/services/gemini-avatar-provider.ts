import { GoogleGenAI } from '@google/genai';
import { FACE_CLASSIFY_PROMPT } from './avatar-prompts';

// Thin wrapper around the @google/genai Interactions API so AvatarService can
// be tested against a fake. All Gemini specifics (input shapes, response
// parsing, model ids) live here.

export interface ReferenceImage {
  data: Buffer;
  mimeType: string;
}

export interface GeneratedImageResult {
  buffer: Buffer;
  mimeType: string;
  model: string;
  latencyMs: number;
  interactionId?: string;
  usage?: unknown;
}

export interface FaceClassification {
  faceLikely: boolean;
  model: string;
  rawOutput: string;
}

export interface AvatarImageProvider {
  isConfigured(): boolean;
  generateImage(prompt: string, reference?: ReferenceImage): Promise<GeneratedImageResult>;
  classifyFace(image: ReferenceImage): Promise<FaceClassification>;
}

// Minimal structural types for the parts of the Interactions response we read
// (the SDK's own response types are looser than this usage).
interface InteractionLike {
  id?: string;
  usage?: unknown;
  output_text?: string;
  output_image?: { data?: string; mime_type?: string };
}

export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
export const DEFAULT_CLASSIFY_MODEL = 'gemini-3.5-flash';

export class GeminiAvatarProvider implements AvatarImageProvider {
  private client: GoogleGenAI | null = null;

  private readonly imageModel = process.env.AVATAR_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  private readonly classifyModel = process.env.AVATAR_CLASSIFY_MODEL || DEFAULT_CLASSIFY_MODEL;

  public isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  private getClient(): GoogleGenAI {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY is not set — avatar generation is unavailable');
    }
    if (this.client == null) {
      this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return this.client;
  }

  public async generateImage(prompt: string, reference?: ReferenceImage): Promise<GeneratedImageResult> {
    const ai = this.getClient();
    const input: unknown[] = [{ type: 'text', text: prompt }];
    if (reference) {
      input.push({
        type: 'image',
        mime_type: reference.mimeType,
        data: reference.data.toString('base64'),
      });
    }

    const startedAt = Date.now();
    const interaction = (await ai.interactions.create({
      model: this.imageModel,
      input: input as never,
      // 512px 1:1 is the smallest/cheapest square the API supports; the
      // service derives the 256px display asset from it. jpeg is the only
      // mime_type the live API accepts here (png is rejected).
      response_format: {
        type: 'image',
        mime_type: 'image/jpeg',
        aspect_ratio: '1:1',
        image_size: '512',
      },
    } as never)) as InteractionLike;
    const latencyMs = Date.now() - startedAt;

    const image = interaction.output_image;
    if (!image?.data) {
      throw new Error(
        `Gemini returned no image (interaction ${interaction.id ?? 'unknown'}): ${
          interaction.output_text?.slice(0, 300) ?? 'no output text'
        }`
      );
    }

    return {
      buffer: Buffer.from(image.data, 'base64'),
      mimeType: image.mime_type ?? 'image/png',
      model: this.imageModel,
      latencyMs,
      interactionId: interaction.id,
      usage: interaction.usage,
    };
  }

  // Cheap multimodal classification instead of a local face detector: proper
  // on-box detection would drag in TensorFlow/OpenCV native builds, while one
  // flash text call costs a fraction of a cent and handles drawings/edge cases.
  public async classifyFace(image: ReferenceImage): Promise<FaceClassification> {
    const ai = this.getClient();
    const interaction = (await ai.interactions.create({
      model: this.classifyModel,
      input: [
        { type: 'text', text: FACE_CLASSIFY_PROMPT },
        { type: 'image', mime_type: image.mimeType, data: image.data.toString('base64') },
      ] as never,
    } as never)) as InteractionLike;

    const rawOutput = (interaction.output_text ?? '').trim();
    return {
      // Anything other than an affirmative FACE falls back to random
      // generation — the safe branch when the classifier is unsure.
      faceLikely: /\bFACE\b/i.test(rawOutput) && !/NOT_FACE/i.test(rawOutput),
      model: this.classifyModel,
      rawOutput,
    };
  }
}

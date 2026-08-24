import { NextResponse } from "next/server";
import { fullDraftVoice, recordVoicePlay, updateVoiceSignals } from "@inspyr/pipeline";
import { VoiceUnavailableError, ConsentRequiredError } from "@inspyr/voice";
import { currentUser } from "@/lib/auth";
import { requireWorkspace } from "@/lib/workspace";

/** The whole script as one file — the thing a creator puts under a video. */
export async function POST(request: Request) {
  if (!(await currentUser())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let draftId: string;
  try {
    const body = (await request.json()) as { draftId?: string };
    if (!body.draftId) throw new Error("missing draftId");
    draftId = body.draftId;
  } catch {
    return NextResponse.json({ error: "Which draft?" }, { status: 400 });
  }

  try {
    const ws = await requireWorkspace();
    const result = await fullDraftVoice(ws.id, draftId);
    await recordVoicePlay({ workspaceId: ws.id, draftId, kind: "full" });
    await updateVoiceSignals(ws.id);

    return new NextResponse(new Uint8Array(result.audio), {
      headers: {
        "content-type": "audio/mpeg",
        "content-disposition": `attachment; filename="inspyr-${draftId.slice(0, 8)}.mp3"`,
        "x-inspyr-seconds": String(result.seconds),
        "x-inspyr-cached": String(result.cached),
      },
    });
  } catch (err) {
    if (err instanceof ConsentRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof VoiceUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not make the audio." },
      { status: 500 },
    );
  }
}

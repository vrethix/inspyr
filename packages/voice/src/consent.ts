/**
 * Voice cloning consent.
 *
 * Cloning a voice is not like generating text. A cloned voice can be used to
 * make someone appear to say things they never said, and the person whose voice
 * it is may not be the person operating the account. So cloning is blocked
 * unless a consent record exists — enforced here, not documented in a README
 * and hoped for.
 *
 * This gate ships before cloning does, deliberately: a guardrail added after
 * the feature is a guardrail that gets skipped.
 */

export const CONSENT_STATEMENT =
  "This is my own voice, or I have the explicit permission of the person whose voice this is. "
  + "I will not use it to impersonate anyone.";

export interface VoiceConsent {
  workspaceId: string;
  /** The provider's id for the cloned voice. */
  referenceId: string;
  confirmedAt: Date | null;
  statement: string;
}

export class ConsentRequiredError extends Error {
  constructor(referenceId: string) {
    super(
      `Voice ${referenceId} has no recorded consent. A cloned voice cannot be used until `
      + `someone confirms it is their own or that they have permission.`,
    );
    this.name = "ConsentRequiredError";
  }
}

/** Throws unless this specific voice has a confirmed consent record. */
export function assertConsent(consent: VoiceConsent | null | undefined, referenceId: string): void {
  if (!consent || consent.referenceId !== referenceId || !consent.confirmedAt) {
    throw new ConsentRequiredError(referenceId);
  }
}

export function hasConsent(consent: VoiceConsent | null | undefined): boolean {
  return Boolean(consent?.confirmedAt);
}

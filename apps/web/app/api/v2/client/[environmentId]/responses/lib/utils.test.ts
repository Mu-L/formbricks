import { getOrganizationBillingByEnvironmentId } from "@/app/api/v2/client/[environmentId]/responses/lib/organization";
import { verifyRecaptchaToken } from "@/app/api/v2/client/[environmentId]/responses/lib/recaptcha";
import { checkSurveyValidity } from "@/app/api/v2/client/[environmentId]/responses/lib/utils";
import { TResponseInputV2 } from "@/app/api/v2/client/[environmentId]/responses/types/response";
import { responses } from "@/app/lib/api/response";
import { symmetricDecrypt } from "@/lib/crypto";
import { getIsSpamProtectionEnabled } from "@/modules/ee/license-check/lib/utils";
import { Organization } from "@prisma/client";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { logger } from "@formbricks/logger";
import { TSurvey } from "@formbricks/types/surveys/types";

vi.mock("@/lib/i18n/utils", () => ({
  getLocalizedValue: vi.fn().mockImplementation((value, language) => {
    return typeof value === "string" ? value : value[language] || value["default"] || "";
  }),
}));

vi.mock("@/app/api/v2/client/[environmentId]/responses/lib/recaptcha", () => ({
  verifyRecaptchaToken: vi.fn(),
}));

vi.mock("@/app/lib/api/response", () => ({
  responses: {
    badRequestResponse: vi.fn((message) => new Response(message, { status: 400 })),
    notFoundResponse: vi.fn((message) => new Response(message, { status: 404 })),
  },
}));

vi.mock("@/modules/ee/license-check/lib/utils", () => ({
  getIsSpamProtectionEnabled: vi.fn(),
}));

vi.mock("@/app/api/v2/client/[environmentId]/responses/lib/organization", () => ({
  getOrganizationBillingByEnvironmentId: vi.fn(),
}));

vi.mock("@formbricks/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/crypto", () => ({
  symmetricDecrypt: vi.fn(),
}));
vi.mock("@/lib/constants", () => ({
  ENCRYPTION_KEY: "test-key",
}));

const mockSurvey: TSurvey = {
  id: "survey-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  name: "Test Survey",
  environmentId: "env-1",
  type: "link",
  status: "inProgress",
  questions: [],
  displayOption: "displayOnce",
  recontactDays: null,
  autoClose: null,
  closeOnDate: null,
  delay: 0,
  displayPercentage: null,
  autoComplete: null,
  singleUse: null,
  triggers: [],
  languages: [],
  pin: null,
  segment: null,
  styling: null,
  surveyClosedMessage: null,
  hiddenFields: { enabled: false },
  welcomeCard: { enabled: false, showResponseCount: false, timeToFinish: false },
  variables: [],
  createdBy: null,
  recaptcha: { enabled: false, threshold: 0.5 },
  displayLimit: null,
  endings: [],
  followUps: [],
  isBackButtonHidden: false,
  isSingleResponsePerEmailEnabled: false,
  isVerifyEmailEnabled: false,
  projectOverwrites: null,
  runOnDate: null,
  showLanguageSwitch: false,
};

const mockResponseInput: TResponseInputV2 = {
  surveyId: "survey-1",
  environmentId: "env-1",
  data: {},
  finished: false,
  ttc: {},
  meta: {},
};

const mockBillingData: Organization["billing"] = {
  limits: {
    monthly: { miu: 0, responses: 0 },
    projects: 3,
  },
  period: "monthly",
  periodStart: new Date(),
  plan: "scale",
  stripeCustomerId: "mock-stripe-customer-id",
};

describe("checkSurveyValidity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test("should return badRequestResponse if survey environmentId does not match", async () => {
    const survey = { ...mockSurvey, environmentId: "env-2" };
    const result = await checkSurveyValidity(survey, "env-1", mockResponseInput);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(400);
    expect(responses.badRequestResponse).toHaveBeenCalledWith(
      "Survey is part of another environment",
      {
        "survey.environmentId": "env-2",
        environmentId: "env-1",
      },
      true
    );
  });

  test("should return null if recaptcha is not enabled", async () => {
    const survey = { ...mockSurvey, recaptcha: { enabled: false, threshold: 0.5 } };
    const result = await checkSurveyValidity(survey, "env-1", mockResponseInput);
    expect(result).toBeNull();
  });

  test("should return badRequestResponse if recaptcha enabled, spam protection enabled, but token is missing", async () => {
    const survey = { ...mockSurvey, recaptcha: { enabled: true, threshold: 0.5 } };
    vi.mocked(getIsSpamProtectionEnabled).mockResolvedValue(true);
    const responseInputWithoutToken = { ...mockResponseInput };
    delete responseInputWithoutToken.recaptchaToken;

    const result = await checkSurveyValidity(survey, "env-1", responseInputWithoutToken);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(400);
    expect(logger.error).toHaveBeenCalledWith("Missing recaptcha token");
    expect(responses.badRequestResponse).toHaveBeenCalledWith(
      "Missing recaptcha token",
      { code: "recaptcha_verification_failed" },
      true
    );
  });

  test("should return not found response if billing data is not found", async () => {
    const survey = { ...mockSurvey, recaptcha: { enabled: true, threshold: 0.5 } };
    vi.mocked(getIsSpamProtectionEnabled).mockResolvedValue(true);
    vi.mocked(getOrganizationBillingByEnvironmentId).mockResolvedValue(null);

    const result = await checkSurveyValidity(survey, "env-1", {
      ...mockResponseInput,
      recaptchaToken: "test-token",
    });
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(404);
    expect(responses.notFoundResponse).toHaveBeenCalledWith("Organization", null);
    expect(getOrganizationBillingByEnvironmentId).toHaveBeenCalledWith("env-1");
  });

  test("should return null if recaptcha is enabled but spam protection is disabled", async () => {
    const survey = { ...mockSurvey, recaptcha: { enabled: true, threshold: 0.5 } };
    vi.mocked(getIsSpamProtectionEnabled).mockResolvedValue(false);
    vi.mocked(verifyRecaptchaToken).mockResolvedValue(true);
    vi.mocked(getOrganizationBillingByEnvironmentId).mockResolvedValue(mockBillingData);
    const result = await checkSurveyValidity(survey, "env-1", {
      ...mockResponseInput,
      recaptchaToken: "test-token",
    });
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith("Spam protection is not enabled for this organization");
  });

  test("should return badRequestResponse if recaptcha verification fails", async () => {
    const survey = { ...mockSurvey, recaptcha: { enabled: true, threshold: 0.5 } };
    const responseInputWithToken = { ...mockResponseInput, recaptchaToken: "test-token" };
    vi.mocked(getIsSpamProtectionEnabled).mockResolvedValue(true);
    vi.mocked(verifyRecaptchaToken).mockResolvedValue(false);
    vi.mocked(getOrganizationBillingByEnvironmentId).mockResolvedValue(mockBillingData);

    const result = await checkSurveyValidity(survey, "env-1", responseInputWithToken);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(400);
    expect(verifyRecaptchaToken).toHaveBeenCalledWith("test-token", 0.5);
    expect(responses.badRequestResponse).toHaveBeenCalledWith(
      "reCAPTCHA verification failed",
      { code: "recaptcha_verification_failed" },
      true
    );
  });

  test("should return null if recaptcha verification passes", async () => {
    const survey = { ...mockSurvey, recaptcha: { enabled: true, threshold: 0.5 } };
    const responseInputWithToken = { ...mockResponseInput, recaptchaToken: "test-token" };
    vi.mocked(getIsSpamProtectionEnabled).mockResolvedValue(true);
    vi.mocked(verifyRecaptchaToken).mockResolvedValue(true);
    vi.mocked(getOrganizationBillingByEnvironmentId).mockResolvedValue(mockBillingData);

    const result = await checkSurveyValidity(survey, "env-1", responseInputWithToken);
    expect(result).toBeNull();
    expect(verifyRecaptchaToken).toHaveBeenCalledWith("test-token", 0.5);
  });

  test("should return null for a valid survey and input", async () => {
    const survey = { ...mockSurvey }; // Recaptcha disabled by default in mock
    const result = await checkSurveyValidity(survey, "env-1", mockResponseInput);
    expect(result).toBeNull();
  });

  test("should return badRequestResponse if singleUse is enabled and singleUseId is missing", async () => {
    const survey = { ...mockSurvey, singleUse: { enabled: true, isEncrypted: false } };
    const result = await checkSurveyValidity(survey, "env-1", { ...mockResponseInput });
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(400);
    expect(responses.badRequestResponse).toHaveBeenCalledWith("Missing single use id", {
      surveyId: survey.id,
      environmentId: "env-1",
    });
  });

  test("should return badRequestResponse if singleUse is enabled and meta.url is missing", async () => {
    const survey = { ...mockSurvey, singleUse: { enabled: true, isEncrypted: false } };
    const result = await checkSurveyValidity(survey, "env-1", {
      ...mockResponseInput,
      singleUseId: "su-1",
      meta: {},
    });
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(400);
    expect(responses.badRequestResponse).toHaveBeenCalledWith("Missing or invalid URL in response metadata", {
      surveyId: survey.id,
      environmentId: "env-1",
    });
  });

  test("should return badRequestResponse if meta.url is invalid", async () => {
    const survey = { ...mockSurvey, singleUse: { enabled: true, isEncrypted: false } };
    const result = await checkSurveyValidity(survey, "env-1", {
      ...mockResponseInput,
      singleUseId: "su-1",
      meta: { url: "not-a-url" },
    });
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(400);
    expect(responses.badRequestResponse).toHaveBeenCalledWith(
      "Invalid URL in response metadata",
      expect.objectContaining({ surveyId: survey.id, environmentId: "env-1" })
    );
  });

  test("should return badRequestResponse if suId is missing from url", async () => {
    const survey = { ...mockSurvey, singleUse: { enabled: true, isEncrypted: false } };
    const url = "https://example.com/?foo=bar";
    const result = await checkSurveyValidity(survey, "env-1", {
      ...mockResponseInput,
      singleUseId: "su-1",
      meta: { url },
    });
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(400);
    expect(responses.badRequestResponse).toHaveBeenCalledWith("Missing single use id", {
      surveyId: survey.id,
      environmentId: "env-1",
    });
  });

  test("should return badRequestResponse if isEncrypted and decrypted suId does not match singleUseId", async () => {
    const survey = { ...mockSurvey, singleUse: { enabled: true, isEncrypted: true } };
    const url = "https://example.com/?suId=encrypted-id";
    vi.mocked(symmetricDecrypt).mockReturnValue("decrypted-id");
    const resultEncryptedMismatch = await checkSurveyValidity(survey, "env-1", {
      ...mockResponseInput,
      singleUseId: "su-1",
      meta: { url },
    });
    expect(symmetricDecrypt).toHaveBeenCalledWith("encrypted-id", "test-key");
    expect(resultEncryptedMismatch).toBeInstanceOf(Response);
    expect(resultEncryptedMismatch?.status).toBe(400);
    expect(responses.badRequestResponse).toHaveBeenCalledWith("Invalid single use id", {
      surveyId: survey.id,
      environmentId: "env-1",
    });
  });

  test("should return badRequestResponse if not encrypted and suId does not match singleUseId", async () => {
    const survey = { ...mockSurvey, singleUse: { enabled: true, isEncrypted: false } };
    const url = "https://example.com/?suId=su-2";
    const result = await checkSurveyValidity(survey, "env-1", {
      ...mockResponseInput,
      singleUseId: "su-1",
      meta: { url },
    });
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(400);
    expect(responses.badRequestResponse).toHaveBeenCalledWith("Invalid single use id", {
      surveyId: survey.id,
      environmentId: "env-1",
    });
  });

  test("should return null if singleUse is enabled, not encrypted, and suId matches singleUseId", async () => {
    const survey = { ...mockSurvey, singleUse: { enabled: true, isEncrypted: false } };
    const url = "https://example.com/?suId=su-1";
    const result = await checkSurveyValidity(survey, "env-1", {
      ...mockResponseInput,
      singleUseId: "su-1",
      meta: { url },
    });
    expect(result).toBeNull();
  });

  test("should return null if singleUse is enabled, encrypted, and decrypted suId matches singleUseId", async () => {
    const survey = { ...mockSurvey, singleUse: { enabled: true, isEncrypted: true } };
    const url = "https://example.com/?suId=encrypted-id";
    vi.mocked(symmetricDecrypt).mockReturnValue("su-1");
    const _resultEncryptedMatch = await checkSurveyValidity(survey, "env-1", {
      ...mockResponseInput,
      singleUseId: "su-1",
      meta: { url },
    });
    expect(symmetricDecrypt).toHaveBeenCalledWith("encrypted-id", "test-key");
    expect(_resultEncryptedMatch).toBeNull();
  });
});

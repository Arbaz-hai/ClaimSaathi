-- CreateTable
CREATE TABLE "DemoSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "simulatedNow" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClaimCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "scenario" TEXT,
    "customerName" TEXT NOT NULL,
    "patientRelation" TEXT,
    "policyHolderName" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "insurerName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "hospitalName" TEXT NOT NULL,
    "hospitalEmail" TEXT,
    "treatmentDescription" TEXT NOT NULL,
    "diagnosis" TEXT,
    "admissionDate" DATETIME,
    "dischargeDate" DATETIME,
    "icdCode" TEXT,
    "claimedAmountPaise" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentBlocker" TEXT,
    "nextBestAction" TEXT,
    "responsibleParty" TEXT,
    "settledAmountPaise" INTEGER,
    "settlementSummary" TEXT,
    "mockExternalRef" TEXT,
    "lastSubmittedActionId" TEXT,
    CONSTRAINT "ClaimCase_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UploadedDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "docType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "pageCount" INTEGER,
    "extractionStatus" TEXT NOT NULL DEFAULT 'NOT_ATTEMPTED',
    "extractionMethod" TEXT,
    "extractedText" TEXT,
    "provenanceNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadedDocument_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClaimCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtractedField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'EXTRACTED',
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExtractedField_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PolicyClause" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "clauseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PolicyClause_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClaimCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentId" TEXT,
    "clauseId" TEXT,
    "page" INTEGER,
    "excerpt" TEXT NOT NULL,
    "extractionStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceReference_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClaimCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "triggerEvent" TEXT NOT NULL,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "summary" TEXT,
    "error" TEXT,
    "inputDigest" TEXT,
    "toolsJson" TEXT,
    "nextAgent" TEXT,
    CONSTRAINT "AgentRun_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClaimCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentOutput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentOutput_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaimEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "simulatedAt" DATETIME NOT NULL,
    "evidenceIds" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClaimEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClaimCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "responsibleParty" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AGENT',
    "dueAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClaimCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutboundAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientName" TEXT,
    "message" TEXT NOT NULL,
    "dataSharedJson" TEXT,
    "attachmentDocIdsJson" TEXT,
    "draftVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT,
    "sentAt" DATETIME,
    "mockRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutboundAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClaimCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "actionId" TEXT,
    "scope" TEXT NOT NULL,
    "draftVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Approval_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClaimCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Approval_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "OutboundAction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MockIntegrationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestJson" TEXT,
    "responseJson" TEXT,
    "statusCode" INTEGER,
    "latencyMs" INTEGER,
    "simulatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MockIntegrationLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClaimCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GRANTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "detail" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConsentRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimCase_reference_key" ON "ClaimCase"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedDocument_caseId_sha256_key" ON "UploadedDocument"("caseId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedField_documentId_fieldKey_key" ON "ExtractedField"("documentId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyClause_caseId_documentId_clauseId_key" ON "PolicyClause"("caseId", "documentId", "clauseId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_sessionId_purpose_key" ON "ConsentRecord"("sessionId", "purpose");

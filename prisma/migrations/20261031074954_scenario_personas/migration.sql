-- CreateTable
CREATE TABLE "ScenarioPersona" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PersonaMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonaMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonaMessage_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ScenarioPersona" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonaMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClaimCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioPersona_scenario_key" ON "ScenarioPersona"("scenario");

-- CreateIndex
CREATE INDEX "PersonaMessage_sessionId_personaId_createdAt_idx" ON "PersonaMessage"("sessionId", "personaId", "createdAt");

import { Navigate, Route, Routes } from "../i18n/router";
import { LabPage } from "./LabPage";
import { LabTrendmetrPage } from "./LabTrendmetrPage";
import { LabXDataPage } from "./LabXDataPage";
import { LabPitchVsTsPage } from "./LabPitchVsTsPage";
import { LabMatchListPage } from "./LabMatchListPage";
import { LabPitchModelsPage } from "./LabPitchModelsPage";
import { LabNeprohraPage } from "./LabNeprohraPage";
import { LabUxPreviewPage } from "./LabUxPreviewPage";

/** Experimentální stránky. Načítají se jen ve vývoji (`npm run dev`), produkční build je neobsahuje. */
export default function LabRoutes() {
  return (
    <Routes>
      <Route index element={<LabPage />} />
      <Route path="trendmetr" element={<LabTrendmetrPage />} />
      <Route path="xdata" element={<LabXDataPage />} />
      <Route path="api" element={<Navigate to="/lab" replace />} />
      <Route path="api/sm-pitch" element={<Navigate to="/lab" replace />} />
      <Route path="api/pitch" element={<LabPitchVsTsPage />} />
      <Route path="match-list" element={<LabMatchListPage />} />
      <Route path="pitch-models" element={<LabPitchModelsPage />} />
      <Route path="neprohra" element={<LabNeprohraPage />} />
      <Route path="ux-preview" element={<LabUxPreviewPage />} />
    </Routes>
  );
}

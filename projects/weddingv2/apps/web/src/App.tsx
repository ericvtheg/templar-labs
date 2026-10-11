import { Route, Routes } from "react-router";
import { IndexPage, NotFound } from "./index/IndexPage.tsx";
import * as v1 from "./v1/pages.tsx";
import { V1Layout } from "./v1/V1Layout.tsx";
import * as v2 from "./v2/pages.tsx";
import { V2Layout } from "./v2/V2Layout.tsx";
import { V3App } from "./v3/V3App.tsx";
import * as v4 from "./v4/pages.tsx";
import { V4Layout, type Variant } from "./v4/V4Layout.tsx";

// v4 and v5 are one design. v5 leaves the photo off the homepage.
const variants: readonly Variant[] = [
  { id: "v4", photo: true },
  { id: "v5", photo: false },
];

export function App() {
  return (
    <Routes>
      <Route path="/" element={<IndexPage />} />

      <Route path="/v1" element={<V1Layout />}>
        <Route index element={<v1.Home />} />
        <Route path="schedule" element={<v1.Schedule />} />
        <Route path="travel" element={<v1.Travel />} />
        <Route path="stay" element={<v1.Stay />} />
        <Route path="things-to-do" element={<v1.ThingsToDo />} />
        <Route path="faq" element={<v1.Faq />} />
      </Route>

      <Route path="/v2" element={<V2Layout />}>
        <Route index element={<v2.Home />} />
        <Route path="schedule" element={<v2.Schedule />} />
        <Route path="travel" element={<v2.Travel />} />
        <Route path="stay" element={<v2.Stay />} />
        <Route path="things-to-do" element={<v2.ThingsToDo />} />
        <Route path="faq" element={<v2.Faq />} />
      </Route>

      {/* v3 keeps the table mounted. The child route only names the open card. */}
      <Route path="/v3" element={<V3App />}>
        <Route index element={null} />
        <Route path="schedule" element={null} />
        <Route path="travel" element={null} />
        <Route path="stay" element={null} />
        <Route path="things-to-do" element={null} />
        <Route path="faq" element={null} />
      </Route>

      {variants.map((variant) => (
        <Route key={variant.id} path={`/${variant.id}`} element={<V4Layout variant={variant} />}>
          <Route index element={<v4.Home />} />
          <Route path="schedule" element={<v4.Schedule />} />
          <Route path="travel" element={<v4.Travel />} />
          <Route path="stay" element={<v4.Travel />} />
          <Route path="things-to-do" element={<v4.ThingsToDo />} />
          <Route path="faq" element={<v4.Faq />} />
        </Route>
      ))}

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

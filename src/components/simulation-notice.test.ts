import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SimulationNotice, SIMULATION_NOTICE_TEXT, TAKEDOWN_LINK_TEXT } from "@/components/simulation-notice";

describe("SimulationNotice", () => {
  it("renders the persistent AI parody disclosure", () => {
    const markup = renderToStaticMarkup(React.createElement(SimulationNotice));

    expect(markup).toContain(SIMULATION_NOTICE_TEXT);
    expect(markup).toContain("AI simulation");
    expect(markup).not.toContain(TAKEDOWN_LINK_TEXT);
  });

  it("can render the report and takedown link", () => {
    const markup = renderToStaticMarkup(React.createElement(SimulationNotice, { showReportLink: true }));

    expect(markup).toContain(TAKEDOWN_LINK_TEXT);
    expect(markup).toContain("mailto:");
  });
});

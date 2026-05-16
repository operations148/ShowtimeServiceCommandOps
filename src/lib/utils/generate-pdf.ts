"use client";

export async function downloadReportAsPDF(
  htmlContent: string,
  filename: string
): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "-99999px";
  container.style.left = "-99999px";
  container.style.width = "794px"; // A4 at 96 dpi
  container.style.backgroundColor = "white";
  container.style.padding = "0";
  container.style.margin = "0";
  container.style.zIndex = "-1";
  container.innerHTML = htmlContent;
  document.body.appendChild(container);

  // Give fonts/layout time to settle
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    // Hide the "Print / Save as PDF" button that's only for standalone HTML view
    const printBtn = container.querySelector(".no-print") as HTMLElement | null;
    if (printBtn) printBtn.style.display = "none";

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      width: 794,
      windowWidth: 794,
    });

    const imgWidth = 210; // A4 mm
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const imgData = canvas.toDataURL("image/png", 1.0);
    let position = 0;
    let heightLeft = imgHeight;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

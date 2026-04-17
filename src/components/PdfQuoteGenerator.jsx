import React, { useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { quotesService } from "../../services/supabaseService";

export default function PdfQuoteGenerator({ quoteId, quote, isOpen, onClose }) {
  const [generating, setGenerating] = useState(false);

  const generatePDF = async () => {
    if (!quote) return;

    setGenerating(true);
    try {
      // Create a temporary container with the quote HTML
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.width = "210mm"; // A4 width
      container.style.padding = "20px";
      container.style.backgroundColor = "white";
      container.style.fontFamily = "Arial, sans-serif";

      // Build HTML content
      const htmlContent = `
        <div style="font-family: Arial, sans-serif;">
          <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px;">
            <h1 style="margin: 0; color: #1a1a1a;">QUOTATION</h1>
            <p style="margin: 5px 0; color: #666;">Lubricant Trading & Pricing</p>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px;">
            <div>
              <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">FROM:</h3>
              <p style="margin: 5px 0; font-weight: bold;">Your Company Name</p>
              <p style="margin: 5px 0; font-size: 12px;">Email: info@company.com</p>
              <p style="margin: 5px 0; font-size: 12px;">Phone: +1-234-567-8900</p>
            </div>
            <div>
              <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">TO:</h3>
              <p style="margin: 5px 0; font-weight: bold;">${quote.customers?.name || "N/A"}</p>
              <p style="margin: 5px 0; font-size: 12px;">${quote.customers?.contact_person || ""}</p>
              <p style="margin: 5px 0; font-size: 12px;">${quote.customers?.country || "N/A"}</p>
              <p style="margin: 5px 0; font-size: 12px; color: #666;">${quote.customers?.email || ""}</p>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
            <div>
              <p style="margin: 0; color: #666; font-size: 12px;">Quote #</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 14px;">${quote.quote_number}</p>
            </div>
            <div>
              <p style="margin: 0; color: #666; font-size: 12px;">Date</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 14px;">${new Date(quote.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p style="margin: 0; color: #666; font-size: 12px;">Valid Until</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 14px;">${new Date(quote.valid_until).toLocaleDateString()}</p>
            </div>
            <div>
              <p style="margin: 0; color: #666; font-size: 12px;">Currency</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 14px;">${quote.currency || "USD"}</p>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
              <tr style="background-color: #333; color: white;">
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Product</th>
                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Qty</th>
                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Unit Price</th>
                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Margin</th>
                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${
                quote.quote_items && Array.isArray(quote.quote_items)
                  ? quote.quote_items
                      .map(
                        (item) => `
                <tr>
                  <td style="padding: 12px; border: 1px solid #ddd;">${item.skus?.name || "N/A"}</td>
                  <td style="padding: 12px; text-align: right; border: 1px solid #ddd;">${item.quantity}</td>
                  <td style="padding: 12px; text-align: right; border: 1px solid #ddd;">$${item.unit_price?.toFixed(2) || "0.00"}</td>
                  <td style="padding: 12px; text-align: right; border: 1px solid #ddd;">${item.margin_percent || 0}%</td>
                  <td style="padding: 12px; text-align: right; border: 1px solid #ddd; font-weight: bold;">$${item.line_total?.toFixed(2) || "0.00"}</td>
                </tr>
              `
                      )
                      .join("")
                  : ""
              }
            </tbody>
          </table>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 30px; margin-bottom: 30px;">
            <div>
              <h3 style="margin: 0 0 15px 0; font-size: 14px; color: #333;">Terms & Conditions</h3>
              <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; font-size: 11px; line-height: 1.6;">
                <p style="margin: 5px 0;"><strong>Payment Terms:</strong> ${quote.payment_terms || "N/A"}</p>
                <p style="margin: 5px 0;"><strong>Delivery:</strong> ${quote.delivery_days || "N/A"} days from receipt of payment</p>
                <p style="margin: 5px 0;"><strong>Validity:</strong> This quote is valid until ${new Date(quote.valid_until).toLocaleDateString()}</p>
                ${quote.notes ? `<p style="margin: 5px 0;"><strong>Notes:</strong> ${quote.notes}</p>` : ""}
              </div>
            </div>
            <div style="background-color: #f0f8ff; padding: 20px; border-radius: 5px; border: 2px solid #007bff;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="color: #666;">Subtotal:</span>
                <span>$${(quote.total_amount || 0).toFixed(2)}</span>
              </div>
              <div style="border-top: 1px solid #ddd; padding-top: 10px; display: flex; justify-content: space-between;">
                <span style="font-weight: bold; font-size: 16px;">Total:</span>
                <span style="font-weight: bold; font-size: 16px; color: #007bff;">$${(quote.total_amount || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div style="border-top: 2px solid #ddd; padding-top: 20px; text-align: center; font-size: 11px; color: #999;">
            <p style="margin: 5px 0;">Thank you for your business!</p>
            <p style="margin: 5px 0;">For questions, please contact sales@company.com</p>
            <p style="margin: 10px 0 0 0; font-size: 10px;">This is an automated quotation. Please verify all details before proceeding.</p>
          </div>
        </div>
      `;

      container.innerHTML = htmlContent;
      document.body.appendChild(container);

      // Convert to canvas and create PDF
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= 297; // A4 height in mm

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= 297;
      }

      // Save PDF
      pdf.save(`Quote_${quote.quote_number}.pdf`);

      // Clean up
      document.body.removeChild(container);

      alert("PDF generated and downloaded successfully!");
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert("Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen || !quote) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Quote Preview</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          {/* Quote Preview */}
          <div className="bg-gray-50 p-8 rounded-lg mb-6 text-sm">
            <div style={{ fontSize: "13px", lineHeight: "1.6" }}>
              <div style={{ textAlign: "center", marginBottom: "30px", borderBottom: "2px solid #333", paddingBottom: "20px" }}>
                <h1 style={{ margin: 0, fontSize: "24px" }}>QUOTATION</h1>
                <p style={{ margin: "5px 0", color: "#666" }}>Lubricant Trading & Pricing</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px", marginBottom: "30px" }}>
                <div>
                  <h3 style={{ margin: "0 0 10px 0", fontWeight: "bold" }}>FROM:</h3>
                  <p style={{ margin: "5px 0", fontWeight: "bold" }}>Your Company Name</p>
                  <p style={{ margin: "5px 0", fontSize: "12px" }}>Email: info@company.com</p>
                </div>
                <div>
                  <h3 style={{ margin: "0 0 10px 0", fontWeight: "bold" }}>TO:</h3>
                  <p style={{ margin: "5px 0", fontWeight: "bold" }}>{quote.customers?.name}</p>
                  <p style={{ margin: "5px 0", fontSize: "12px" }}>{quote.customers?.country}</p>
                </div>
              </div>

              <div style={{ background: "#f5f5f5", padding: "15px", marginBottom: "20px", borderRadius: "5px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "15px" }}>
                  <div>
                    <p style={{ margin: 0, color: "#666", fontSize: "11px" }}>Quote #</p>
                    <p style={{ margin: "5px 0", fontWeight: "bold" }}>{quote.quote_number}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, color: "#666", fontSize: "11px" }}>Date</p>
                    <p style={{ margin: "5px 0", fontWeight: "bold" }}>
                      {new Date(quote.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: 0, color: "#666", fontSize: "11px" }}>Valid Until</p>
                    <p style={{ margin: "5px 0", fontWeight: "bold" }}>
                      {new Date(quote.valid_until).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: 0, color: "#666", fontSize: "11px" }}>Total</p>
                    <p style={{ margin: "5px 0", fontWeight: "bold", color: "#007bff" }}>
                      ${quote.total_amount?.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {quote.quote_items && quote.quote_items.length > 0 && (
                <table style={{ width: "100%", marginBottom: "20px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#333", color: "white" }}>
                      <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Product</th>
                      <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Qty</th>
                      <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Price</th>
                      <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.quote_items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{item.skus?.name}</td>
                        <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                          ${item.unit_price?.toFixed(2)}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee", fontWeight: "bold" }}>
                          ${item.line_total?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={generatePDF}
              disabled={generating}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {generating ? "Generating..." : "Download PDF"}
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-400"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

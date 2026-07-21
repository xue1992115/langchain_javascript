import PDFKit
import Foundation

guard CommandLine.arguments.count > 1 else {
    print("ERROR: No file path provided")
    exit(1)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let document = PDFDocument(url: url) else {
    print("ERROR: Failed to open PDF")
    exit(1)
}

var parts: [String] = []
for i in 0..<document.pageCount {
    if let page = document.page(at: i), let text = page.string {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            parts.append(trimmed)
        }
    }
}

let result = parts.joined(separator: "\n\n")
if result.isEmpty {
    print("ERROR: No text extracted")
    exit(1)
}
print(result)

import SwiftUI
import WebKit

struct ContentView: View {
    @State var data: String = ""
    @State var items: [String] = []
    @State var loading: Bool = false

    var body: some View {
        VStack {
            ForEach(items, id: \.self) { item in
                Text(item)
            }
        }
    }

    func setupWebView() {
        let wv = WKWebView()
        wv.load(URLRequest(url: URL(string: "https://example.com")!))
    }

    func saveToken(_ token: String) {
        UserDefaults.standard.set(token, forKey: "token")
    }

    func fetch() {
        URLSession.shared.dataTask(with: URL(string: "https://api.example.com")!) { _, _, _ in
            print("done")
        }.resume()
    }
}

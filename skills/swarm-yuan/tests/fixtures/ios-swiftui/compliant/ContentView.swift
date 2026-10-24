import SwiftUI
import WebKit

struct ContentView: View {
    @StateObject var viewModel = ViewModel()

    var body: some View {
        LazyVStack {
            ForEach(viewModel.items, id: \.self) { item in
                Text(item)
            }
        }
    }
}

class ViewModel: ObservableObject {
    @Published var items: [String] = []

    func saveToken(_ token: String) {
        // Use Keychain for sensitive data
        let keychain = KeychainHelper.shared
        keychain.save(token, for: "token")
    }

    func fetch() async {
        let (data, _) = try await URLSession.shared.data(from: URL(string: "https://api.example.com")!)
    }
}

import SwiftUI

struct ContentView: View {
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            NeuroEdgeWebView(urlString: NeuroEdgeConfig.startURL)
                .ignoresSafeArea()
        }
    }
}

#Preview {
    ContentView()
}

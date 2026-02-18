require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "neuroedge-react-native-twin"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.license      = package["license"]
  s.author       = { "NeuroEdge" => "support@neuroedge.ai" }
  s.homepage     = "https://github.com/josephwere/NeuroEdge"
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/josephwere/NeuroEdge.git", :tag => s.version.to_s }
  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.requires_arc = true

  s.dependency "React-Core"
end

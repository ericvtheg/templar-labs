require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name           = "TemplarHealthKit"
  s.version        = package["version"]
  s.summary        = "Full-history foreground HealthKit reader"
  s.description    = "Reads authorized HealthKit history with anchored pagination and specialized series queries."
  s.license        = "MIT"
  s.author         = "Templar Labs"
  s.homepage       = "https://example.invalid"
  s.platforms      = { :ios => "15.1" }
  s.source         = { :path => "." }
  s.static_framework = true
  s.dependency "ExpoModulesCore"
  s.frameworks = "HealthKit"
  s.source_files = "ios/**/*.{h,m,mm,swift}"
end

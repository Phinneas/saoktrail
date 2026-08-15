Feature: All 7 sites build successfully with affiliate modal
  The build-all.sh script must pass with the modal integrated.

  Scenario: Build-all passes
    Given the affiliate modal is integrated into all sites
    When I run build-all.sh
    Then all 7 sites should build without errors

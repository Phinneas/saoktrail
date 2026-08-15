Feature: Modal can be dismissed without breaking the page
  Close button, Escape key, and backdrop click all dismiss the modal.

  Scenario: Close button dismisses modal
    Given the affiliate modal is visible
    When I click the close button
    Then the modal should disappear
    And the page should remain functional

  Scenario: Escape key dismisses modal
    Given the affiliate modal is visible
    When I press the Escape key
    Then the modal should disappear

  Scenario: Backdrop click dismisses modal
    Given the affiliate modal is visible
    When I click the backdrop
    Then the modal should disappear

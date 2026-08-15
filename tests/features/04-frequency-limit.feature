Feature: Modal frequency is limited to once per 24 hours
  Once dismissed, the modal should not reappear for 24 hours.

  Scenario: Modal does not reappear after dismissal
    Given I am on the about page with a desktop viewport
    When I trigger exit intent and dismiss the modal
    And I navigate to the blog page
    And I trigger exit intent again
    Then I should not see the affiliate modal

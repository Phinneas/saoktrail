Feature: Modal triggers correctly on desktop and mobile
  Desktop uses exit-intent (mouse leaves top of viewport).
  Mobile uses scroll-depth (70% of page).

  Scenario: Desktop exit-intent shows modal
    Given I am on the about page with a desktop viewport
    When I move the mouse out the top of the viewport
    Then I should see the affiliate modal
    And the modal should contain between 3 and 4 product cards
    And each card should have an Amazon affiliate link

  Scenario: Mobile scroll-depth shows slide-up sheet
    Given I am on the about page with a mobile viewport
    When I scroll to 70% of the page
    Then I should see the affiliate slide-up sheet
    And the sheet should contain between 3 and 4 product cards

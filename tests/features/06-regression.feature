Feature: Existing site features remain functional after affiliate modal
  Regression: nav, footer, chat widget, theme switcher, springs, blog must still work.

  Scenario Outline: Core pages load without console errors
    Given I am on <page>
    Then the page should load successfully
    And the navigation should be visible
    And there should be no JavaScript console errors

    Examples:
      | page       |
      | /          |
      | /blog      |
      | /directory |
      | /about     |

  Scenario: Chat widget still works
    Given I am on the homepage
    Then the chat widget button should be visible
    When I click the chat widget button
    Then the chat panel should open

  Scenario: Springs directory loads with cards
    Given I am on the directory page
    Then the spring cards should be visible

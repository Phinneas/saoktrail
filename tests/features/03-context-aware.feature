Feature: Context-aware product selection
  Products are weighted by page context (blog keywords, itinerary categories, minerals page).

  Scenario: Minerals page biases toward hydration products
    Given I am on the minerals page with a desktop viewport
    When I trigger exit intent
    Then at least one product should be hydration-related (bottle, electrolytes, or sunscreen)

  Scenario: Blog post with winter keyword biases toward cold-weather gear
    Given I am on a blog post containing the word "winter"
    When I trigger exit intent
    Then the modal should show context-relevant products

  Scenario: Products differ on page reload
    Given I am on the about page with a desktop viewport
    When I trigger exit intent and note the products
    And I reload and trigger exit intent again
    Then at least one product should differ from the first set

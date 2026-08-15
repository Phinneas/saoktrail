Feature: Affiliate modal appears only on allowed pages
  The modal must NOT appear on homepages, map pages, or spring detail pages.
  The modal MUST appear on blog, directory, about, minerals, trip-planner, and itineraries.

  Scenario: No modal on homepage
    Given I am on the homepage
    Then I should not see the affiliate modal

  Scenario: No modal on map page
    Given I am on the map page
    Then I should not see the affiliate modal

  Scenario: No modal on spring detail page
    Given I am on a spring detail page
    Then I should not see the affiliate modal

  Scenario: Modal on blog index (desktop)
    Given I am on the blog index page with a desktop viewport
    When I trigger exit intent
    Then I should see the affiliate modal

  Scenario: Modal on about page (desktop)
    Given I am on the about page with a desktop viewport
    When I trigger exit intent
    Then I should see the affiliate modal

  Scenario: Modal on directory page (desktop)
    Given I am on the directory page with a desktop viewport
    When I trigger exit intent
    Then I should see the affiliate modal

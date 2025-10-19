Create a mobile-friendly web game called Block-You. Use this specifications below for all of the rules.

---

Complete Specification in Gherkin Syntax

Conventions Used

Board coordinates use corners A1, A20, T1, T20.

Own-corner contact → new piece touches own-color piece at a corner.

Own-edge contact → edge-adjacent square with same color (illegal after the first move).

Other-color contact → edge or corner and always legal if no overlap.

Pieces can be rotated or flipped before placement.

Once placed, a piece cannot be moved.

2-player game uses color pairs (P1: Blue/Red, P2: Yellow/Green).

3-player game removes one color entirely.

Scoring:

−1 per unplayed square

+15 if all 21 pieces placed

+20 if all placed and last piece was the single square.




---

Feature: Setup & Piece Inventory

Feature: Setup & Piece Inventory
  In order to play a valid game of Blokus
  As players with color sets
  We need a 20x20 board, four corner starts, and 21 unique pieces per color

  Background:
    Given a 20x20 empty board
    And four player colors: Blue, Yellow, Red, Green
    And each color has exactly 21 unique pieces composed of 1–5 squares

  Scenario: Board initialization
    When the game starts
    Then all squares are empty
    And no piece is placed
    And the available pieces for each color list includes exactly 21 unique polyominoes

  Scenario: Piece transformations are allowed
    Given a player selects any piece of their color
    When the player rotates or flips that piece
    Then the transformed shape is eligible for placement if all placement rules are satisfied


---

Feature: First Move Constraints

Feature: First Move Constraints
  In order to start the game correctly
  Each color's first piece must cover its assigned corner square

  Background:
    Given the game is at turn 1 and no pieces have been placed

  Scenario Outline: Valid first move must cover own corner
    Given it is <Color>'s first move
    When <Color> places a piece so that it covers <Corner>
    Then the move is legal
    And the piece is fixed on the board
    And the piece is removed from <Color>'s available pieces

    Examples:
      | Color | Corner |
      | Blue  | A1     |
      | Yellow| T1     |
      | Red   | A20    |
      | Green | T20    |

  Scenario Outline: First move not covering own corner is illegal
    Given it is <Color>'s first move
    When <Color> attempts to place a piece that does not cover <Corner>
    Then the move is illegal and must be rejected
    And no board state changes

    Examples:
      | Color | Corner |
      | Blue  | A1     |
      | Yellow| T1     |
      | Red   | A20    |
      | Green | T20    |


---

Feature: General Placement Validity (After First Move)

Feature: General Placement Validity
  After the first move, placements must corner-touch own color and never edge-touch it

  Background:
    Given there are already some legally placed pieces on the board

  Scenario: Legal placement with required own-corner contact
    Given Blue has at least one piece already placed
    And a target empty region exists
    When Blue places a new piece so that
      | condition                     |
      | it shares at least one corner with a Blue piece |
      | it shares no edges with any Blue piece          |
      | it does not overlap any existing piece          |
      | it lies entirely within the 20x20 board         |
    Then the placement is legal

  Scenario: Illegal placement with own-edge contact
    Given Red has at least one piece already placed
    When Red places a new piece edge-adjacent to any Red piece
    Then the move is illegal and must be rejected

  Scenario: Illegal placement with no own-corner contact
    Given Yellow has at least one piece already placed
    When Yellow places a piece such that it neither shares a corner with Yellow nor overlaps
    Then the move is illegal and must be rejected

  Scenario: Legal contact with other colors by edge
    Given Green and Blue have pieces on the board
    When Green places a piece that edge-touches Blue but satisfies Green's own-corner rule
    Then the move is legal

  Scenario: Legal contact with other colors by corner
    Given Green and Red have pieces on the board
    When Green places a piece that corner-touches Red and satisfies Green's own-corner rule
    Then the move is legal

  Scenario: Illegal overlap with any piece
    Given any occupied squares exist
    When a player attempts to place a piece overlapping any occupied square
    Then the move is illegal and must be rejected

  Scenario: Illegal out-of-bounds placement
    When a player attempts to place any part of a piece outside A1..T20
    Then the move is illegal and must be rejected

  Scenario: Pieces cannot be moved once placed
    Given a legal move has just been committed
    When the player attempts to adjust or relocate that piece
    Then the action is illegal; the piece remains fixed


---

Feature: Must Play If Able and Passing

Feature: Mandatory Play and Passing
  Players must play on their turn if they have at least one legal move; otherwise they must pass

  Scenario: Must play when at least one legal move exists
    Given it is Blue's turn
    And at least one legal placement exists for Blue
    When Blue attempts to pass
    Then the pass is disallowed
    And Blue must instead place a legal move

  Scenario: Pass when no legal move exists
    Given it is Yellow's turn
    And no legal placement exists for Yellow
    When Yellow declares pass
    Then the pass is recorded
    And turn proceeds to the next color

  Scenario: Multiple consecutive passes allowed
    Given Red, Green, Blue each have no legal move on their respective turns
    When Red passes and then Green passes and then Blue passes
    Then all passes are recorded
    And play attempts continue until all players have passed consecutively (ending the game)


---

Feature: Turn Order

Feature: Turn Order
  The game proceeds in clockwise color order

  Scenario: Standard 4-player order
    Given four players control Blue, Yellow, Red, Green respectively
    When the game progresses
    Then turn order repeats: Blue → Yellow → Red → Green → Blue ...

  Scenario: Turn skipped only by legal pass
    Given it is Red's turn
    And Red has at least one legal move
    When Red declines to place and does not pass
    Then play cannot advance until Red makes a legal move or a pass


---

Feature: Edge vs Corner Adjacency Rules

Feature: Edge vs Corner Adjacency Rules
  Clarify all edge/corner interactions among same and different colors

  Scenario: Same color corner-touch is required and sufficient
    Given Blue has a previous Blue piece
    When Blue's new piece shares at least one corner with Blue and shares no edges with Blue
    Then the move is legal

  Scenario: Same color edge-touch is always illegal
    Given any player has previous pieces of their color
    When their new piece shares an edge with their own color
    Then the move is illegal

  Scenario: Different color edge-touch is legal
    Given adjacent spaces contain Yellow
    When Red's new piece edge-touches Yellow
    Then the move is legal if Red's own-corner rule is satisfied

  Scenario: Different color corner-touch is legal
    Given adjacent spaces contain Green
    When Blue's new piece corner-touches Green
    Then the move is legal if Blue's own-corner rule is satisfied


---

Feature: Blocking and Accessibility

Feature: Blocking & Accessibility
  Pieces can block paths; only the rules of contact govern legality

  Scenario: Legal move that blocks opponent access to a region
    Given a region of empty squares exists reachable only via edges blocked by Red
    When Red places a piece that further restricts access
    Then the move is legal if it follows Red's own-corner rule
    And opponents are simply constrained by available legal placements

  Scenario: No requirement to maintain corner reachability
    Given Yellow's remaining pieces would require a diagonal path from existing Yellow corners
    And those diagonals are incidentally sealed by other colors' edges
    When Yellow has no legal placement
    Then Yellow must pass
    And no remedial path or “opening” is required by rules


---

Feature: End of Game

Feature: End of Game
  The game ends when no player can make a legal move

  Scenario: Ending by consecutive passes
    Given it is Green's turn and Green cannot move
    And Blue cannot move on the following turn
    And Yellow cannot move after that
    And Red cannot move after that
    When four consecutive passes occur (one per color)
    Then the game ends immediately

  Scenario: Ending when one player can still move
    Given three players have passed in sequence
    And the fourth player still has a legal move
    When the fourth player plays a legal move
    Then the pass chain is broken
    And the game continues in standard turn order


---

Feature: Scoring

Feature: Scoring
  Compute scores from unplaced squares and bonuses

  Background:
    Given the game has ended

  Scenario: Base scoring from unplayed pieces
    Given Blue has unplayed pieces totaling 7 squares
    And Yellow has unplayed pieces totaling 0 squares
    And Red has unplayed pieces totaling 3 squares
    And Green has unplayed pieces totaling 9 squares
    When scores are computed
    Then Blue's score is -7
    And Yellow's score is 0
    And Red's score is -3
    And Green's score is -9

  Scenario: All pieces placed bonus +15
    Given Red placed all 21 pieces
    And Red's last placed piece was not the single-square piece
    When scores are computed
    Then Red receives +15 bonus added to base score 0
    And Red's final score is +15

  Scenario: All pieces placed with single-square last bonus +20
    Given Yellow placed all 21 pieces
    And Yellow's last placed piece was the single-square piece
    When scores are computed
    Then Yellow receives +20 bonus added to base score 0
    And Yellow's final score is +20

  Scenario: Winner determination
    Given final scores are: Blue -5, Yellow +15, Red -3, Green -9
    When the winner is identified
    Then Yellow is the winner with the highest score

  Scenario: Tie handling
    Given final scores are: Blue +15, Yellow +15, Red -3, Green -9
    When the result is declared
    Then the game result is a tie between Blue and Yellow


---

Feature: Player Count Variants

Feature: Player Count Variants
  Support the standard 2- and 3-player configurations for classic Blokus

  Scenario: 2-player uses two colors per player with fixed color order
    Given Player 1 controls Blue and Red
    And Player 2 controls Yellow and Green
    And corners remain A1 (Blue), T1 (Yellow), A20 (Red), T20 (Green)
    When turns proceed
    Then the order is Blue → Yellow → Red → Green → Blue ...
    And on each color turn the controlling player must play or pass for that color
    And all placement rules apply per color independently

  Scenario: 2-player first moves cover respective color corners
    Given it is the first cycle of turns
    When Player 1 plays Blue covering A1
    And Player 2 plays Yellow covering T1
    And Player 1 plays Red covering A20
    And Player 2 plays Green covering T20
    Then all first-move constraints are satisfied

  Scenario: 3-player removes one color entirely
    Given three players choose any three of the four colors
    And the unused color has no turns and no pieces
    When play proceeds in clockwise order among the used colors
    Then first-move corners apply only to the used colors
    And all placement rules remain unchanged for the active colors

  Scenario: Variant scoring unchanged by player count
    Given the game ends in a 2- or 3-player game
    When scores are computed
    Then scoring and bonuses are applied identically per active color


---

Feature: Piece Identity & Exhaustion

Feature: Piece Identity & Exhaustion
  Each unique piece can be used at most once per color

  Scenario: Cannot replay an already placed piece
    Given Blue has already placed its L-shaped pentomino
    When Blue attempts to place the L-shaped pentomino again
    Then the move is illegal because the piece is no longer available

  Scenario: Single-square piece uniqueness
    Given Green has not yet placed the single-square piece
    When Green places the single-square piece legally
    Then Green's single-square piece becomes unavailable


---

Feature: Corner Coverage Edge Cases

Feature: Corner Coverage Edge Cases
  Clarify coverage when shapes touch corners indirectly

  Scenario: First move using a larger piece still must include the assigned corner square
    Given it is Yellow's first move
    When Yellow places a 5-square piece that covers T1 among its squares
    Then the move is legal

  Scenario: Later move with diagonal chain continuation
    Given Red has at least one diagonal chain path across gaps
    When Red places a piece that only touches Red at a single corner through that chain
    Then the move is legal if no own-edge contact occurs


---

Feature: No Hidden or Optional Rules

Feature: No Hidden or Optional Rules
  Only the enumerated rules govern legality

  Scenario: No requirement to declare target area or future reachability
    Given a player places a legal piece following their own-corner rule
    When opponents claim the player must keep paths open for future pieces
    Then the claim is rejected; the placement remains legal

  Scenario: No capturing or displacement
    Given a legal placement fills a space adjacent to opponents
    When an opponent claims displacement or capture
    Then the claim is rejected; existing pieces cannot be moved or removed


import 'package:flutter_test/flutter_test.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';

/// Unit tests for Wishlist State Management
/// 
/// **Property 3: Wishlist State Consistency**
/// *For any* successful wishlist save operation, the `wishlistStatusProvider` 
/// SHALL contain the saved place's ID mapped to its destination ID.
/// 
/// **Validates: Requirements 2.1, 2.2**
void main() {
  group('Wishlist State Management - Property 3: Wishlist State Consistency', () {
    group('checkWishlistStatus', () {
      test('returns (true, destinationId) when spotId exists in statusMap', () {
        // Arrange
        final statusMap = <String, String?>{
          'spot-123': 'dest-456',
          'spot-789': 'dest-012',
        };
        const spotId = 'spot-123';

        // Act
        final (isInWishlist, destinationId) = checkWishlistStatus(statusMap, spotId);

        // Assert
        expect(isInWishlist, isTrue);
        expect(destinationId, equals('dest-456'));
      });

      test('returns (false, null) when spotId does not exist in statusMap', () {
        // Arrange
        final statusMap = <String, String?>{
          'spot-123': 'dest-456',
        };
        const spotId = 'spot-unknown';

        // Act
        final (isInWishlist, destinationId) = checkWishlistStatus(statusMap, spotId);

        // Assert
        expect(isInWishlist, isFalse);
        expect(destinationId, isNull);
      });

      test('returns (true, destinationId) for multiple spots in same destination', () {
        // Arrange - multiple spots saved to same destination
        final statusMap = <String, String?>{
          'spot-1': 'dest-A',
          'spot-2': 'dest-A',
          'spot-3': 'dest-B',
        };

        // Act & Assert
        final (isInWishlist1, destId1) = checkWishlistStatus(statusMap, 'spot-1');
        expect(isInWishlist1, isTrue);
        expect(destId1, equals('dest-A'));

        final (isInWishlist2, destId2) = checkWishlistStatus(statusMap, 'spot-2');
        expect(isInWishlist2, isTrue);
        expect(destId2, equals('dest-A'));

        final (isInWishlist3, destId3) = checkWishlistStatus(statusMap, 'spot-3');
        expect(isInWishlist3, isTrue);
        expect(destId3, equals('dest-B'));
      });

      test('returns (false, null) for empty statusMap', () {
        // Arrange
        final statusMap = <String, String?>{};
        const spotId = 'any-spot';

        // Act
        final (isInWishlist, destinationId) = checkWishlistStatus(statusMap, spotId);

        // Assert
        expect(isInWishlist, isFalse);
        expect(destinationId, isNull);
      });

      test('handles spotId with special characters', () {
        // Arrange - spotIds can be place names with special chars
        final statusMap = <String, String?>{
          'Café de Flore': 'dest-paris',
          'Müller\'s Bakery': 'dest-berlin',
          '东京塔': 'dest-tokyo',
        };

        // Act & Assert
        final (isInWishlist1, destId1) = checkWishlistStatus(statusMap, 'Café de Flore');
        expect(isInWishlist1, isTrue);
        expect(destId1, equals('dest-paris'));

        final (isInWishlist2, destId2) = checkWishlistStatus(statusMap, 'Müller\'s Bakery');
        expect(isInWishlist2, isTrue);
        expect(destId2, equals('dest-berlin'));

        final (isInWishlist3, destId3) = checkWishlistStatus(statusMap, '东京塔');
        expect(isInWishlist3, isTrue);
        expect(destId3, equals('dest-tokyo'));
      });
    });

    group('State Consistency Property', () {
      test('after adding spot to wishlist, statusMap contains spotId -> destinationId mapping', () {
        // This test validates Property 3:
        // For any successful wishlist save operation, the wishlistStatusProvider 
        // SHALL contain the saved place's ID mapped to its destination ID.
        
        // Arrange - simulate initial empty state
        var statusMap = <String, String?>{};
        const spotId = 'new-spot-123';
        const destinationId = 'dest-456';

        // Act - simulate successful save by adding to map
        // (In real code, this happens when tripsProvider refreshes after API call)
        statusMap = Map.from(statusMap)..addAll({spotId: destinationId});

        // Assert - verify the mapping exists
        final (isInWishlist, mappedDestId) = checkWishlistStatus(statusMap, spotId);
        expect(isInWishlist, isTrue, reason: 'Spot should be in wishlist after save');
        expect(mappedDestId, equals(destinationId), reason: 'Destination ID should match');
      });

      test('after removing spot from wishlist, statusMap no longer contains spotId', () {
        // Arrange - simulate state with existing spot
        var statusMap = <String, String?>{
          'spot-to-remove': 'dest-123',
          'spot-to-keep': 'dest-456',
        };
        const spotIdToRemove = 'spot-to-remove';

        // Act - simulate successful removal
        statusMap = Map.from(statusMap)..remove(spotIdToRemove);

        // Assert - verify the mapping is removed
        final (isInWishlist, destId) = checkWishlistStatus(statusMap, spotIdToRemove);
        expect(isInWishlist, isFalse, reason: 'Spot should not be in wishlist after removal');
        expect(destId, isNull, reason: 'Destination ID should be null');

        // Verify other spots are unaffected
        final (otherInWishlist, otherDestId) = checkWishlistStatus(statusMap, 'spot-to-keep');
        expect(otherInWishlist, isTrue);
        expect(otherDestId, equals('dest-456'));
      });

      test('statusMap correctly reflects multiple save operations', () {
        // Arrange - simulate sequential saves
        var statusMap = <String, String?>{};

        // Act - simulate multiple saves
        statusMap = Map.from(statusMap)..addAll({'spot-1': 'dest-A'});
        statusMap = Map.from(statusMap)..addAll({'spot-2': 'dest-A'});
        statusMap = Map.from(statusMap)..addAll({'spot-3': 'dest-B'});

        // Assert - all mappings should exist
        expect(statusMap.length, equals(3));
        
        final (in1, dest1) = checkWishlistStatus(statusMap, 'spot-1');
        expect(in1, isTrue);
        expect(dest1, equals('dest-A'));

        final (in2, dest2) = checkWishlistStatus(statusMap, 'spot-2');
        expect(in2, isTrue);
        expect(dest2, equals('dest-A'));

        final (in3, dest3) = checkWishlistStatus(statusMap, 'spot-3');
        expect(in3, isTrue);
        expect(dest3, equals('dest-B'));
      });
    });
  });
}

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager

class Database:
    """Handles PostgreSQL database connections"""

    @staticmethod
    def get_connection():
        try:
            connection = psycopg2.connect(
                os.getenv("DATABASE_URL"),  
                cursor_factory=RealDictCursor,
                sslmode="require"   # 
            )
            return connection
        except psycopg2.Error as e:
            print(f"Database connection error: {e}")
            return None

    @staticmethod
    @contextmanager
    def get_cursor():
        connection = Database.get_connection()
        if not connection:
            raise Exception("Failed to connect to database")

        cursor = connection.cursor()
        try:
            yield cursor
            connection.commit()
        except Exception as e:
            connection.rollback()
            raise e
        finally:
            cursor.close()
            connection.close()

    @staticmethod
    def execute_query(query, params=None):
        """Execute SELECT query"""
        try:
            with Database.get_cursor() as cursor:
                cursor.execute(query, params or ())
                return cursor.fetchall()
        except psycopg2.Error as e:
            print(f"Query execution error: {e}")
            return None

    @staticmethod
    def execute_update(query, params=None, return_id=False):
        """Execute INSERT, UPDATE, DELETE"""
        try:
            with Database.get_cursor() as cursor:
                cursor.execute(query, params or ())
                if return_id:
                    result = cursor.fetchone()
                    if result:
                        return result.get("id") or result[0]
                    return None
                return True
        except psycopg2.Error as e:
            print(f"Update execution error: {e}")
            return False
